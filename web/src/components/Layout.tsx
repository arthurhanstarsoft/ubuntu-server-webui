import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  FolderOpen,
  Gauge,
  ListTree,
  LogOut,
  SquareTerminal,
  Wrench,
} from 'lucide-react';
import type { StaticInfo } from '@usw/shared';
import { api } from '../lib/api';
import { useStatsFeed } from '../lib/statsFeed';
import { ToastHost } from './Toast';

const NAV = [
  { to: '/', label: 'Dashboard', icon: Gauge },
  { to: '/services', label: 'Services', icon: Wrench },
  { to: '/processes', label: 'Processes', icon: ListTree },
  { to: '/files', label: 'Files', icon: FolderOpen },
  { to: '/terminal', label: 'Terminal', icon: SquareTerminal },
];

export function Layout() {
  const navigate = useNavigate();
  const { status } = useStatsFeed();
  const { data: info } = useQuery({
    queryKey: ['static-info'],
    queryFn: () => api<StaticInfo>('/api/stats/static'),
    staleTime: Infinity,
  });

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' });
    navigate('/login');
  }

  return (
    <div className="flex h-screen">
      <aside className="flex w-52 shrink-0 flex-col border-r border-line bg-bg1">
        <div className="border-b border-line px-4 py-4">
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                status === 'live' ? 'bg-ok' : status === 'connecting' ? 'bg-warn' : 'bg-err'
              }`}
              title={status === 'live' ? 'connected' : status}
            />
            <span className="truncate font-mono text-sm font-semibold text-accent">
              {info?.hostname ?? 'server'}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-mute">{info?.distro ?? ' '}</p>
        </div>

        <nav className="flex-1 space-y-0.5 p-2">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-bg2 font-medium text-text shadow-[inset_2px_0_0_0_var(--color-accent)]'
                    : 'text-mute hover:bg-bg2/60 hover:text-text'
                }`
              }
            >
              <Icon size={16} strokeWidth={2} />
              {label}
            </NavLink>
          ))}
        </nav>

        <button
          onClick={logout}
          className="flex items-center gap-2.5 border-t border-line px-5 py-3 text-sm text-mute transition-colors hover:text-err"
        >
          <LogOut size={16} />
          Log out
        </button>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <ToastHost />
    </div>
  );
}
