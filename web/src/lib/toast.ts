import { useSyncExternalStore } from 'react';

export interface Toast {
  id: number;
  kind: 'ok' | 'err';
  text: string;
}

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

export function toast(kind: Toast['kind'], text: string): void {
  const id = nextId++;
  toasts = [...toasts, { id, kind, text }];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, 4000);
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => toasts,
  );
}
