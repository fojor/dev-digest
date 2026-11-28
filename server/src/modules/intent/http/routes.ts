import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { RequestContext } from '../../_shared/context.js';
import type { IntentService } from '../application/intent.service.js';
import { presentResponse } from './presenter.js';
import { IdParams, IntentResponse } from './schemas.js';

export interface IntentRouteDeps {
  service: IntentService;
  context: (req: FastifyRequest) => Promise<RequestContext>;
}

/**
 *   GET  /pulls/:id/intent            → the stored intent (stale flag computed at read time)
 *   POST /pulls/:id/intent/classify   → classify now (synchronous; no body); 200 also when status is failed
 */
export async function registerIntentRoutes(
  appBase: FastifyInstance,
  { service, context }: IntentRouteDeps,
): Promise<void> {
  const app = appBase.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/pulls/:id/intent',
    { schema: { params: IdParams, response: { 200: IntentResponse } } },
    async (req) => {
      const { workspaceId } = await context(req);
      const { intent, classifying } = await service.get(workspaceId, req.params.id);
      return presentResponse(req.params.id, intent, classifying);
    },
  );

  app.post(
    '/pulls/:id/intent/classify',
    {
      schema: { params: IdParams, response: { 200: IntentResponse } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await context(req);
      const intent = await service.classify(workspaceId, req.params.id, 'manual');
      return presentResponse(req.params.id, intent, false);
    },
  );
}
