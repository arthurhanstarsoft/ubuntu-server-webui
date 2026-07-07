import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';

export function LoginPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) });
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError('Too many attempts — wait a minute and try again.');
      } else if (err instanceof ApiError && err.status === 401) {
        setError('Wrong password.');
      } else {
        setError('Could not reach the server.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-lg border border-line bg-bg1 p-8">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="h-3 w-3 rounded-full bg-accent" />
          <h1 className="font-mono text-lg font-semibold">Server Console</h1>
        </div>
        <label className="mb-1.5 block text-xs font-medium tracking-wide text-mute uppercase" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-line bg-bg0 px-3 py-2 font-mono text-sm outline-none focus:border-accent"
        />
        {error && <p className="mt-3 text-sm text-err">{error}</p>}
        <button
          type="submit"
          disabled={busy || password.length === 0}
          className="mt-5 w-full rounded-md bg-accent py-2 text-sm font-medium text-white transition-colors hover:bg-accent-dim disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
