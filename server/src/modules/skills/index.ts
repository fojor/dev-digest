import type { FastifyInstance } from 'fastify';
import { getContext } from '../_shared/context.js';
import { SkillsService } from './application/skills.service.js';
import { registerSkillsRoutes } from './http/routes.js';

/**
 * Skills module factory (M2). Repository, Unit of Work and the archive reader
 * come from the composition root (platform/container.ts), typed as ports.
 */
export default async function skillsModule(app: FastifyInstance): Promise<void> {
  const c = app.container;
  const service = new SkillsService({
    skills: c.skillsRepo,
    uow: c.skillsUow,
    archive: c.archive,
    stats: c.skillStats,
    countTokens: (text) => c.tokenizer.count(text),
  });
  await registerSkillsRoutes(app, { service, context: (req) => getContext(c, req) });
}
