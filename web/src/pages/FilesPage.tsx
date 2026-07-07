import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  File,
  FileText,
  Folder,
  FolderPlus,
  Link2,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import type { FileEntry, FileListing } from '@usw/shared';
import { api, ApiError } from '../lib/api';
import { uploadFile } from '../lib/upload';
import { toast } from '../lib/toast';
import { fmtBytes, fmtDate } from '../lib/format';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';

function joinPath(dir: string, name: string): string {
  return dir === '/' ? `/${name}` : `${dir}/${name}`;
}

function errMsg(err: unknown): string {
  return err instanceof ApiError || err instanceof Error ? err.message : 'operation failed';
}

export function FilesPage() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const dir = params.get('path') || '/';

  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [deleting, setDeleting] = useState<FileEntry | null>(null);
  const [renaming, setRenaming] = useState<FileEntry | null>(null);
  const [renameTo, setRenameTo] = useState('');
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ path: string; content: string; dirty: boolean } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['files', dir],
    queryFn: () => api<FileListing>(`/api/files/list?path=${encodeURIComponent(dir)}`),
    retry: false,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['files', dir] });

  function navigate(to: string) {
    setParams({ path: to });
  }

  async function doUpload(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      setUploadPct(0);
      try {
        await uploadFile(dir, file, setUploadPct);
        toast('ok', `uploaded ${file.name}`);
      } catch (err) {
        toast('err', errMsg(err));
      }
    }
    setUploadPct(null);
    invalidate();
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) void doUpload(e.dataTransfer.files);
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) void doUpload(e.target.files);
    e.target.value = '';
  }

  const del = useMutation({
    mutationFn: (entry: FileEntry) =>
      api(`/api/files?path=${encodeURIComponent(joinPath(dir, entry.name))}`, { method: 'DELETE' }),
    onSuccess: (_d, entry) => {
      toast('ok', `deleted ${entry.name}`);
      invalidate();
    },
    onError: (err) => toast('err', errMsg(err)),
    onSettled: () => setDeleting(null),
  });

  const rename = useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) =>
      api('/api/files/rename', { method: 'POST', body: JSON.stringify({ from, to }) }),
    onSuccess: () => {
      toast('ok', 'renamed');
      invalidate();
    },
    onError: (err) => toast('err', errMsg(err)),
    onSettled: () => setRenaming(null),
  });

  const mkdir = useMutation({
    mutationFn: (name: string) =>
      api('/api/files/mkdir', { method: 'POST', body: JSON.stringify({ path: joinPath(dir, name) }) }),
    onSuccess: () => {
      toast('ok', 'folder created');
      invalidate();
    },
    onError: (err) => toast('err', errMsg(err)),
    onSettled: () => setNewFolder(null),
  });

  const save = useMutation({
    mutationFn: ({ path, content }: { path: string; content: string }) =>
      api('/api/files/write', { method: 'PUT', body: JSON.stringify({ path, content }) }),
    onSuccess: () => {
      toast('ok', 'saved');
      setEditor((e) => (e ? { ...e, dirty: false } : e));
    },
    onError: (err) => toast('err', errMsg(err)),
  });

  async function openEditor(entry: FileEntry) {
    const path = joinPath(dir, entry.name);
    try {
      const { content } = await api<{ content: string }>(`/api/files/read?path=${encodeURIComponent(path)}`);
      setEditor({ path, content, dirty: false });
    } catch (err) {
      toast('err', errMsg(err));
    }
  }

  const crumbs = dir === '/' ? [''] : dir.split('/');

  return (
    <div
      className="relative min-h-full p-6"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(false);
      }}
      onDrop={onDrop}
    >
      {dragOver && (
        <div className="pointer-events-none absolute inset-3 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-accent bg-bg0/80">
          <span className="text-sm text-accent">Drop to upload into {dir}</span>
        </div>
      )}

      <header className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">Files</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            title="Refresh"
            className="rounded-md border border-line p-2 text-mute hover:bg-bg2 hover:text-text"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => setNewFolder('')}
            className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm text-mute hover:bg-bg2 hover:text-text"
          >
            <FolderPlus size={14} />
            New folder
          </button>
          <button
            onClick={() => fileInput.current?.click()}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-dim"
          >
            <Upload size={14} />
            Upload
          </button>
          <input ref={fileInput} type="file" multiple hidden onChange={onPick} />
        </div>
      </header>

      {uploadPct !== null && (
        <div className="mb-4 rounded-md border border-line bg-bg1 px-4 py-3">
          <div className="mb-1.5 flex justify-between text-xs text-mute">
            <span>Uploading…</span>
            <span className="font-mono">{uploadPct}%</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-bg2">
            <div className="h-full bg-accent transition-[width]" style={{ width: `${uploadPct}%` }} />
          </div>
        </div>
      )}

      <nav className="mb-3 flex flex-wrap items-center gap-1 font-mono text-sm">
        {crumbs.map((seg, i) => {
          const to = crumbs.slice(0, i + 1).join('/') || '/';
          const isLast = i === crumbs.length - 1;
          return (
            <span key={to} className="flex items-center gap-1">
              {i > 0 && <span className="text-mute">/</span>}
              <button
                onClick={() => navigate(to)}
                disabled={isLast}
                className={isLast ? 'text-text' : 'text-accent hover:underline'}
              >
                {seg || '/'}
              </button>
            </span>
          );
        })}
      </nav>

      <div className="overflow-x-auto rounded-lg border border-line bg-bg1">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs tracking-wide text-mute uppercase">
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="w-28 px-4 py-2.5 font-medium">Size</th>
              <th className="w-44 px-4 py-2.5 font-medium">Modified</th>
              <th className="w-36 px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-mute">
                  Loading…
                </td>
              </tr>
            )}
            {error && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-err">
                  {errMsg(error)}
                </td>
              </tr>
            )}
            {data?.entries.map((entry) => {
              const full = joinPath(dir, entry.name);
              const Icon = entry.type === 'dir' ? Folder : entry.type === 'symlink' ? Link2 : File;
              return (
                <tr key={entry.name} className="border-b border-line/50 last:border-0 hover:bg-bg2/40">
                  <td className="px-4 py-2">
                    <button
                      onClick={() => entry.type === 'dir' && navigate(full)}
                      className={`flex items-center gap-2 font-mono text-xs ${
                        entry.type === 'dir' ? 'text-accent hover:underline' : 'cursor-default'
                      }`}
                    >
                      <Icon size={14} className={entry.type === 'dir' ? 'text-accent' : 'text-mute'} />
                      {entry.name}
                    </button>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-mute">
                    {entry.type === 'file' ? fmtBytes(entry.size) : '—'}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-mute">{fmtDate(entry.mtime)}</td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      {entry.type === 'file' && (
                        <>
                          <button
                            title="Edit as text"
                            onClick={() => void openEditor(entry)}
                            className="rounded p-1.5 text-mute hover:bg-bg2 hover:text-text"
                          >
                            <FileText size={13} />
                          </button>
                          <a
                            title="Download"
                            href={`/api/files/download?path=${encodeURIComponent(full)}`}
                            className="rounded p-1.5 text-mute hover:bg-bg2 hover:text-text"
                          >
                            <Download size={13} />
                          </a>
                        </>
                      )}
                      <button
                        title="Rename"
                        onClick={() => {
                          setRenaming(entry);
                          setRenameTo(entry.name);
                        }}
                        className="rounded p-1.5 text-mute hover:bg-bg2 hover:text-text"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        title="Delete"
                        onClick={() => setDeleting(entry)}
                        className="rounded p-1.5 text-mute hover:bg-bg2 hover:text-err"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {data && data.entries.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-mute">
                  Empty directory. Drop files here to upload.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {data?.truncated && (
        <p className="mt-2 text-xs text-warn">Listing truncated — this directory has more than 2000 entries.</p>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete"
          message={`Permanently delete ${deleting.name}${deleting.type === 'dir' ? ' and everything inside it' : ''}?`}
          confirmLabel="Delete"
          danger
          busy={del.isPending}
          onConfirm={() => del.mutate(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}

      {renaming && (
        <Modal title={`Rename ${renaming.name}`} onClose={() => setRenaming(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              rename.mutate({ from: joinPath(dir, renaming.name), to: joinPath(dir, renameTo) });
            }}
          >
            <input
              autoFocus
              value={renameTo}
              onChange={(e) => setRenameTo(e.target.value)}
              className="w-full rounded-md border border-line bg-bg0 px-3 py-2 font-mono text-sm outline-none focus:border-accent"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenaming(null)}
                className="rounded-md border border-line px-3 py-1.5 text-sm text-mute hover:bg-bg2"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={rename.isPending || !renameTo || renameTo === renaming.name}
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-dim disabled:opacity-50"
              >
                Rename
              </button>
            </div>
          </form>
        </Modal>
      )}

      {newFolder !== null && (
        <Modal title="New folder" onClose={() => setNewFolder(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newFolder) mkdir.mutate(newFolder);
            }}
          >
            <input
              autoFocus
              value={newFolder}
              onChange={(e) => setNewFolder(e.target.value)}
              placeholder="folder name"
              className="w-full rounded-md border border-line bg-bg0 px-3 py-2 font-mono text-sm outline-none focus:border-accent"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewFolder(null)}
                className="rounded-md border border-line px-3 py-1.5 text-sm text-mute hover:bg-bg2"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={mkdir.isPending || !newFolder}
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-dim disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editor && (
        <Modal title={editor.path} onClose={() => setEditor(null)} wide>
          <textarea
            value={editor.content}
            onChange={(e) => setEditor({ ...editor, content: e.target.value, dirty: true })}
            spellCheck={false}
            className="h-96 w-full resize-y rounded-md border border-line bg-bg0 p-3 font-mono text-xs leading-relaxed outline-none focus:border-accent"
          />
          <div className="mt-4 flex items-center justify-end gap-2">
            {editor.dirty && <span className="mr-auto text-xs text-warn">unsaved changes</span>}
            <button
              onClick={() => setEditor(null)}
              className="rounded-md border border-line px-3 py-1.5 text-sm text-mute hover:bg-bg2"
            >
              Close
            </button>
            <button
              onClick={() => save.mutate({ path: editor.path, content: editor.content })}
              disabled={save.isPending || !editor.dirty}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-dim disabled:opacity-50"
            >
              {save.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
