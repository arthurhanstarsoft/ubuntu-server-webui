import type { FastifyInstance } from 'fastify';
import { hasSystemd } from '../platform';
import { listServices, runServiceVerb } from '../services/systemctl';
import { AppError } from '../lib/errors';

export async function servicesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req) => {
    if (req.url.startsWith('/api/services') && !(await hasSystemd())) {
      throw new AppError(501, 'systemd is not available on this host');
    }
  });

  app.get('/api/services', async () => listServices());

  app.post(
    '/api/services/:unit/:verb',
    {
      schema: {
        params: {
          type: 'object',
          required: ['unit', 'verb'],
          properties: {
            unit: { type: 'string', maxLength: 256 },
            verb: { type: 'string', enum: ['start', 'stop', 'restart'] },
          },
        },
      },
    },
    async (req) => {
      const { unit, verb } = req.params as { unit: string; verb: string };
      return runServiceVerb(unit, verb);
    },
  );
}
