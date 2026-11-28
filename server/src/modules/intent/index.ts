import type { FastifyInstance } from 'fastify';
import { getContext } from '../_shared/context.js';
import { registerIntentRoutes } from './http/routes.js';

/**
 * Intent module factory. The service is built once in the container (the
 * reviews module resolves intents through it too, via a reviews-owned port);
 * the container also owns its logger. This factory only mounts the routes.
 */
export default async function intentModule(app: FastifyInstance): Promise<void> {
  const c = app.container;
  await registerIntentRoutes(app, { service: c.intentService, context: (req) => getContext(c, req) });
}
