import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { RequestContext } from '../../_shared/context.js';
import type { ConventionsService } from '../application/conventions.service.js';
import { presentCandidate, presentExtraction, presentList } from './presenter.js';
import { ConventionParams, PatchConventionBody, RepoParams } from './schemas.js';

export interface ConventionsRouteDeps {
  service: ConventionsService;
  context: (req: FastifyRequest) => Promise<RequestContext>;
}

/**
 * Conventions routes (contracts/openapi.yaml). Every route is workspace-scoped;
 * a foreign repo or candidate is «not found» (AC-08).
 *   GET   /repos/:repoId/conventions          → listConventions
 *   POST  /repos/:repoId/conventions/extract  → extractConventions (synchronous, ADR-0003)
 *   PATCH /conventions/:conventionId          → updateConvention (status / rule text)
 */
export async function registerConventionsRoutes(
  appBase: FastifyInstance,
  { service, context }: ConventionsRouteDeps,
): Promise<void> {
  const app = appBase.withTypeProvider<ZodTypeProvider>();

  app.get('/repos/:repoId/conventions', { schema: { params: RepoParams } }, async (req) => {
    const { workspaceId } = await context(req);
    return presentList(await service.list(workspaceId, req.params.repoId));
  });

  app.post('/repos/:repoId/conventions/extract', { schema: { params: RepoParams } }, async (req) => {
    const { workspaceId } = await context(req);
    return presentExtraction(await service.extract(workspaceId, req.params.repoId));
  });

  app.patch(
    '/conventions/:conventionId',
    { schema: { params: ConventionParams, body: PatchConventionBody } },
    async (req) => {
      const { workspaceId } = await context(req);
      const { status, rule } = req.body;
      return presentCandidate(
        await service.updateCandidate(workspaceId, req.params.conventionId, { status, rule }),
      );
    },
  );
}
