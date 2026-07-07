import fs from 'node:fs/promises';
import path from 'node:path';
import type { FileEntry, FileListing } from '@usw/shared';
import { config } from '../config';
import { AppError } from '../lib/errors';

const ROOT = config.filesRoot;
const MAX_ENTRIES = 2000;
export const MAX_TEXT_BYTES = 1024 * 1024; // read/write text editor limit

/**
 * Maps a client-supplied path (posix-style, relative to the browse root) to
 * an absolute path, guaranteed to stay inside FILES_ROOT. The single choke
 * point for every file operation.
 */
export function resolveSafe(rel: unknown): string {
  if (typeof rel !== 'string' || rel.includes('\0')) throw new AppError(400, 'invalid path');
  // Prefixing "." neutralizes absolute paths ("/etc", "C:\...") so they
  // resolve inside ROOT instead of replacing it.
  const abs = path.resolve(ROOT, '.' + path.sep + rel.replaceAll('/', path.sep));
  if (abs !== ROOT && !abs.startsWith(ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep)) {
    throw new AppError(400, 'path escapes the browse root');
  }
  return abs;
}

/**
 * For destructive ops: ensure the real (symlink-resolved) parent directory is
 * still inside ROOT, so a symlinked dir can't smuggle writes/deletes outside.
 */
async function assertRealParentInside(abs: string): Promise<void> {
  const rootReal = await fs.realpath(ROOT);
  const parentReal = await fs.realpath(path.dirname(abs));
  if (parentReal !== rootReal && !parentReal.startsWith(rootReal.endsWith(path.sep) ? rootReal : rootReal + path.sep)) {
    throw new AppError(400, 'path escapes the browse root');
  }
}

function entryType(dirent: { isDirectory(): boolean; isFile(): boolean; isSymbolicLink(): boolean }): FileEntry['type'] {
  if (dirent.isSymbolicLink()) return 'symlink';
  if (dirent.isDirectory()) return 'dir';
  if (dirent.isFile()) return 'file';
  return 'other';
}

export async function listDir(rel: string): Promise<FileListing> {
  const abs = resolveSafe(rel);
  let names;
  try {
    names = await fs.readdir(abs, { withFileTypes: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') throw new AppError(404, 'directory not found');
    if (code === 'ENOTDIR') throw new AppError(400, 'not a directory');
    if (code === 'EACCES' || code === 'EPERM') throw new AppError(403, 'permission denied');
    throw err;
  }
  const truncated = names.length > MAX_ENTRIES;
  const slice = names.slice(0, MAX_ENTRIES);
  const entries: FileEntry[] = await Promise.all(
    slice.map(async (d) => {
      const base: FileEntry = { name: d.name, type: entryType(d), size: 0, mtime: 0 };
      try {
        const st = await fs.lstat(path.join(abs, d.name));
        base.size = st.size;
        base.mtime = st.mtimeMs;
        if (d.isSymbolicLink()) {
          // Report what the link points at so the UI can navigate into linked dirs
          const target = await fs.stat(path.join(abs, d.name)).catch(() => null);
          if (target?.isDirectory()) base.type = 'dir';
        }
      } catch {
        // unreadable entry — keep zeros
      }
      return base;
    }),
  );
  entries.sort((a, b) => (a.type === 'dir' ? 0 : 1) - (b.type === 'dir' ? 0 : 1) || a.name.localeCompare(b.name));
  return { path: rel, entries, truncated };
}

export async function statFile(rel: string): Promise<{ abs: string; size: number }> {
  const abs = resolveSafe(rel);
  const st = await fs.stat(abs).catch(() => null);
  if (!st) throw new AppError(404, 'file not found');
  if (!st.isFile()) throw new AppError(400, 'not a regular file');
  return { abs, size: st.size };
}

export async function readTextFile(rel: string): Promise<string> {
  const { abs, size } = await statFile(rel);
  if (size > MAX_TEXT_BYTES) throw new AppError(413, 'file too large to edit (limit 1 MB)');
  const buf = await fs.readFile(abs);
  if (buf.includes(0)) throw new AppError(415, 'binary file — download it instead');
  return buf.toString('utf8');
}

export async function writeTextFile(rel: string, content: string): Promise<void> {
  const abs = resolveSafe(rel);
  await assertRealParentInside(abs);
  if (Buffer.byteLength(content, 'utf8') > MAX_TEXT_BYTES) throw new AppError(413, 'content too large (limit 1 MB)');
  const tmp = `${abs}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, content, 'utf8');
  await fs.rename(tmp, abs);
}

export async function makeDir(rel: string): Promise<void> {
  const abs = resolveSafe(rel);
  await assertRealParentInside(path.join(abs, '.'));
  await fs.mkdir(abs, { recursive: true });
}

export async function renamePath(fromRel: string, toRel: string): Promise<void> {
  const from = resolveSafe(fromRel);
  const to = resolveSafe(toRel);
  await assertRealParentInside(from);
  await assertRealParentInside(to);
  const existing = await fs.lstat(to).catch(() => null);
  if (existing) throw new AppError(409, 'destination already exists');
  await fs.rename(from, to);
}

export async function deletePath(rel: string): Promise<void> {
  const abs = resolveSafe(rel);
  if (abs === ROOT || abs === (await fs.realpath(ROOT).catch(() => ROOT))) {
    throw new AppError(400, 'refusing to delete the browse root');
  }
  await assertRealParentInside(abs);
  try {
    await fs.rm(abs, { recursive: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') throw new AppError(404, 'not found');
    if (code === 'EACCES' || code === 'EPERM') throw new AppError(403, 'permission denied');
    throw err;
  }
}

export async function prepareUploadDest(destDirRel: string, filename: string, overwrite: boolean): Promise<string> {
  const safeName = path.basename(filename);
  if (!safeName || safeName === '.' || safeName === '..') throw new AppError(400, 'invalid filename');
  const destDir = resolveSafe(destDirRel);
  const dest = path.join(destDir, safeName);
  await assertRealParentInside(dest);
  if (!overwrite) {
    const existing = await fs.lstat(dest).catch(() => null);
    if (existing) throw new AppError(409, `${safeName} already exists`);
  }
  return dest;
}
