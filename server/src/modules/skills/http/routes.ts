import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { RequestContext } from '../../_shared/context.js';
import { IdParams } from '../../_shared/schemas.js';
import type { SkillsService } from '../application/skills.service.js';
import {
  presentImportPreview,
  presentSkill,
  presentStats,
  presentStatsSummary,
  presentVersion,
  toNewSkill,
  toSkillPatch,
} from './presenter.js';
import {
  CreateSkillBody,
  ImportPreviewBody,
  SkillTokensBody,
  UpdateSkillBody,
  VersionParams,
} from './schemas.js';

export interface SkillsRouteDeps {
  service: SkillsService;
  context: (req: FastifyRequest) => Promise<RequestContext>;
}

/**
 * M2 — skills routes. Each handler: parsed input → context → one use case →
 * presenter. Missing skills surface as SkillNotFound (→ 404 in app.ts).
 *   GET    /skills                  → list (workspace-scoped, by name)
 *   GET    /skills/:id              → one skill
 *   POST   /skills                  → create (201); also the import "confirm" step
 *   PUT    /skills/:id              → edit / toggle enabled (content edit bumps version)
 *   DELETE /skills/:id              → delete (agent links cascade)
 *   POST   /skills/import/preview   → parse an uploaded .md / .zip; stores nothing
 *   GET    /skills/stats            → card numbers for every skill (one batch)
 *   GET    /skills/:id/stats        → Stats tab (30-day window)
 *   GET    /skills/:id/versions     → history, newest first
 *   POST   /skills/:id/versions/:version/restore → new version with the old content
 *   POST   /skills/tokens           → tokens a draft's prompt block adds
 */
export async function registerSkillsRoutes(
  appBase: FastifyInstance,
  { service, context }: SkillsRouteDeps,
): Promise<void> {
  const app = appBase.withTypeProvider<ZodTypeProvider>();

  app.get('/skills', async (req) => {
    const { workspaceId } = await context(req);
    return (await service.list(workspaceId)).map(presentSkill);
  });

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await context(req);
    return presentSkill(await service.get(workspaceId, req.params.id));
  });

  app.post('/skills', { schema: { body: CreateSkillBody } }, async (req, reply) => {
    const ctx = await context(req);
    const skill = await service.create(toNewSkill(req.body, ctx));
    reply.status(201);
    return presentSkill(skill);
  });

  app.put('/skills/:id', { schema: { params: IdParams, body: UpdateSkillBody } }, async (req) => {
    const { workspaceId } = await context(req);
    return presentSkill(
      await service.update(workspaceId, req.params.id, toSkillPatch(req.body), req.body.note),
    );
  });

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await context(req);
    await service.delete(workspaceId, req.params.id);
    return { ok: true };
  });

  app.post('/skills/import/preview', { schema: { body: ImportPreviewBody } }, async (req) => {
    await context(req);
    const bytes = new Uint8Array(Buffer.from(req.body.content_base64, 'base64'));
    return presentImportPreview(service.previewImport({ filename: req.body.filename, bytes }));
  });

  app.get('/skills/stats', async (req) => {
    const { workspaceId } = await context(req);
    return (await service.statsSummaries(workspaceId)).map(presentStatsSummary);
  });

  app.get('/skills/:id/stats', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await context(req);
    return presentStats(await service.stats(workspaceId, req.params.id));
  });

  app.get('/skills/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await context(req);
    return (await service.listVersions(workspaceId, req.params.id)).map(presentVersion);
  });

  app.post(
    '/skills/:id/versions/:version/restore',
    { schema: { params: VersionParams } },
    async (req) => {
      const { workspaceId } = await context(req);
      return presentSkill(await service.restoreVersion(workspaceId, req.params.id, req.params.version));
    },
  );

  app.post('/skills/tokens', { schema: { body: SkillTokensBody } }, async (req) => {
    await context(req);
    return { tokens: service.countTokens(req.body) };
  });
}
