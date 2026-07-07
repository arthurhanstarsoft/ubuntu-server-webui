import type { FastifyInstance } from 'fastify';
import { listProcesses, killProcess } from '../services/process-manager';

export async function processesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/processes', async () => listProcesses());

  app.post(
    '/api/processes/:pid/kill',
    {
      schema: {
        params: {
          type: 'object',
          required: ['pid'],
          properties: { pid: { type: 'integer', minimum: 2 } },
        },
        body: {
          type: 'object',
          required: ['signal'],
          properties: { signal: { type: 'string', enum: ['SIGTERM', 'SIGKILL'] } },
        },
      },
    },
    async (req) => {
      const { pid } = req.params as { pid: number };
      const { signal } = req.body as { signal: 'SIGTERM' | 'SIGKILL' };
      killProcess(pid, signal);
      return { ok: true };
    },
  );
}
