import { useToasts } from '../lib/toast';

export function ToastHost() {
  const toasts = useToasts();
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`rounded-md border px-4 py-2.5 text-sm shadow-lg backdrop-blur ${
            t.kind === 'ok'
              ? 'border-ok/40 bg-bg1/95 text-text'
              : 'border-err/40 bg-bg1/95 text-err'
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
