import type { FastifyInstance } from 'fastify';
import { getContext } from '../_shared/context.js';
import { ConventionsService } from './application/conventions.service.js';
import { registerConventionsRoutes } from './http/routes.js';
import { DrizzleConventionsRepository } from './infrastructure/conventions.repository.js';
import { LlmExtractionModel } from './infrastructure/extraction-model.js';
import { CloneSampleSource } from './infrastructure/sample-source.js';

/**
 * Conventions extractor module factory (sad §5) — the only place in the module
 * that wires concrete dependencies. repo-intel, the LLM providers, the feature
 * model resolver and the tokenizer come from the container; the service (and
 * its in-process scan guard) lives once per app instance.
 */
export default async function conventionsModule(app: FastifyInstance): Promise<void> {
  const c = app.container;
  const repo = new DrizzleConventionsRepository(c.db);
  const service = new ConventionsService({
    repo,
    samples: new CloneSampleSource({
      indexState: (repoId) => c.repoIntel.getIndexState(repoId),
      rankedPaths: (repoId, n) => c.repoIntel.getConventionSamples(repoId, n),
      clonePath: (repoId) => repo.clonePath(repoId),
    }),
    model: new LlmExtractionModel({
      resolveModel: (workspaceId) => c.featureModel(workspaceId, 'conventions'),
      llmFor: (provider) => c.llm(provider),
      countTokens: (text) => c.tokenizer.count(text),
    }),
    log: (line) => app.log.info({ conventionsRun: line }, 'conventions extraction run'),
  });
  await registerConventionsRoutes(app, { service, context: (req) => getContext(c, req) });
}
