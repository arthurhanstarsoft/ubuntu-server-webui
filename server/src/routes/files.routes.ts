import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import { AppError } from '../lib/errors';
import {
  deletePath,
  listDir,
  makeDir,
  prepareUploadDest,
  readTextFile,
  renamePath,
  statFile,
  writeTextFile,
  MAX_TEXT_BYTES,
} from '../services/file-service';

const pathQuerySchema = {
  querystring: {
    type: 'object',
    required: ['path'],
    properties: { path: { type: 'string', maxLength: 4096 } },
  },
} as const;

const pathBodySchema = {
  body: {
    type: 'object',
    required: ['path'],
    properties: { path: { type: 'string', maxLength: 4096 } },
  },
} as const;

export async function filesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/files/list', { schema: pathQuerySchema }, async (req) => {
    const { path: rel } = req.query as { path: string };
    return listDir(rel);
  });

  app.get('/api/files/download', { schema: pathQuerySchema }, async (req, reply) => {
    const { path: rel } = req.query as { path: string };
    const { abs, size } = await statFile(rel);
    const name = path.basename(abs);
    reply.header('content-length', size);
    reply.header('content-type', 'application/octet-stream');
    reply.header('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
    return reply.send(createReadStream(abs));
  });

  app.get('/api/files/read', { schema: pathQuerySchema }, async (req) => {
    const { path: rel } = req.query as { path: string };
    return { content: await readTextFile(rel) };
  });

  app.put(
    '/api/files/write',
    {
      bodyLimit: MAX_TEXT_BYTES + 64 * 1024,
      schema: {
        body: {
          type: 'object',
          required: ['path', 'content'],
          properties: {
            path: { type: 'string', maxLength: 4096 },
            content: { type: 'string' },
          },
        },
      },
    },
    async (req) => {
      const { path: rel, content } = req.body as { path: string; content: string };
      await writeTextFile(rel, content);
      return { ok: true };
    },
  );

  app.post('/api/files/mkdir', { schema: pathBodySchema }, async (req) => {
    const { path: rel } = req.body as { path: string };
    await makeDir(rel);
    return { ok: true };
  });

  app.post(
    '/api/files/rename',
    {
      schema: {
        body: {
          type: 'object',
          required: ['from', 'to'],
          properties: {
            from: { type: 'string', maxLength: 4096 },
            to: { type: 'string', maxLength: 4096 },
          },
        },
      },
    },
    async (req) => {
      const { from, to } = req.body as { from: string; to: string };
      await renamePath(from, to);
      return { ok: true };
    },
  );

  app.delete('/api/files', { schema: pathQuerySchema }, async (req) => {
    const { path: rel } = req.query as { path: string };
    await deletePath(rel);
    return { ok: true };
  });

  app.post('/api/files/upload', async (req) => {
    const { path: destDir = '/', overwrite } = req.query as { path?: string; overwrite?: string };
    const part = await req.file();
    if (!part) throw new AppError(400, 'no file in request');
    const dest = await prepareUploadDest(destDir, part.filename, overwrite === '1');
    try {
      await pipeline(part.file, createWriteStream(dest));
    } catch (err) {
      await fs.rm(dest, { force: true });
      throw err;
    }
    if (part.file.truncated) {
      await fs.rm(dest, { force: true });
      throw new AppError(413, 'file exceeds the upload size limit');
    }
    return { ok: true, name: path.basename(dest) };
  });
}
