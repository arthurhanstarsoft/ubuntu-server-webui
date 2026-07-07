import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { config } from '../config';

declare module 'fastify' {
  interface Session {
    authed?: boolean;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/auth/login',
    {
      config: { rateLimit: { max: 5, timeWindow: 60_000 } },
      schema: {
        body: {
          type: 'object',
          required: ['password'],
          properties: { password: { type: 'string', maxLength: 256 } },
        },
      },
    },
    async (req, reply) => {
      const { password } = req.body as { password: string };
      const ok = await bcrypt.compare(password, config.passwordHash);
      if (!ok) {
        req.log.warn({ ip: req.ip }, 'failed login attempt');
        await sleep(500);
        return reply.code(401).send({ error: 'wrong password' });
      }
      req.session.authed = true;
      return { ok: true };
    },
  );

  app.post('/api/auth/logout', async (req) => {
    await req.session.destroy();
    return { ok: true };
  });

  // Reached only when the session is valid (the global auth guard 401s otherwise)
  app.get('/api/auth/me', async () => ({ authed: true }));
}
