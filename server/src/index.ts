import path from 'node:path';
import Fastify, { type FastifyError } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyWebsocket from '@fastify/websocket';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { config } from './config';
import { authRoutes } from './routes/auth.routes';
import { statsRoutes } from './routes/stats.routes';
import { servicesRoutes } from './routes/services.routes';
import { processesRoutes } from './routes/processes.routes';
import { filesRoutes } from './routes/files.routes';
import { terminalRoutes } from './routes/terminal.routes';

const app = Fastify({
  logger: {
    level: 'info',
    transport: config.isProd ? undefined : { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } },
  },
  bodyLimit: 1024 * 1024,
});

await app.register(fastifyCookie);
await app.register(fastifySession, {
  secret: config.sessionSecret,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // plain HTTP on the LAN — see README for TLS options
    maxAge: 7 * 24 * 3600 * 1000,
  },
});
await app.register(fastifyRateLimit, { global: false });
await app.register(fastifyWebsocket, { options: { maxPayload: 1024 * 1024 } });
await app.register(fastifyMultipart, {
  limits: { fileSize: 2 * 1024 * 1024 * 1024, files: 1 },
});

// Deny-by-default auth guard: every /api and /ws route requires a session,
// except the explicit public set. WS upgrade requests pass through here too,
// so an unauthenticated upgrade is rejected before the socket opens.
const PUBLIC_PATHS = new Set(['/api/auth/login', '/api/health']);
app.addHook('preHandler', async (req, reply) => {
  const url = req.url.split('?')[0] ?? '';
  const guarded = url.startsWith('/api') || url.startsWith('/ws');
  if (guarded && !PUBLIC_PATHS.has(url) && !req.session.authed) {
    return reply.code(401).send({ error: 'unauthorized' });
  }
});

// Uniform error shape: { error: message }. AppError carries its own status.
app.setErrorHandler((err: FastifyError, req, reply) => {
  const status = err.validation ? 400 : (err.statusCode ?? 500);
  if (status >= 500) req.log.error(err);
  reply.code(status).send({ error: status >= 500 && config.isProd ? 'internal server error' : err.message });
});

app.get('/api/health', async () => ({ ok: true }));

await app.register(authRoutes);
await app.register(statsRoutes);
await app.register(servicesRoutes);
await app.register(processesRoutes);
await app.register(filesRoutes);
await app.register(terminalRoutes);

// In production the same process serves the built frontend.
if (config.isProd) {
  const webDist = path.resolve(import.meta.dirname, '../../web/dist');
  await app.register(fastifyStatic, { root: webDist });
  app.setNotFoundHandler((req, reply) => {
    if (req.method === 'GET' && !req.url.startsWith('/api') && !req.url.startsWith('/ws')) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'not found' });
  });
}

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info(`files root: ${config.filesRoot}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
