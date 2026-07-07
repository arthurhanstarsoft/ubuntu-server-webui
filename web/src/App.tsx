import { type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { api, isUnauthorized } from './lib/api';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ServicesPage } from './pages/ServicesPage';
import { ProcessesPage } from './pages/ProcessesPage';
import { FilesPage } from './pages/FilesPage';
import { TerminalPage } from './pages/TerminalPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => !isUnauthorized(error) && failureCount < 2,
      refetchOnWindowFocus: false,
    },
  },
});

function AuthGate({ children }: { children: ReactNode }) {
  const { isLoading, error } = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => api<{ authed: boolean }>('/api/auth/me'),
    retry: false,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="h-3 w-3 animate-pulse rounded-full bg-accent" />
      </div>
    );
  }
  if (error) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <AuthGate>
                <Layout />
              </AuthGate>
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="/services" element={<ServicesPage />} />
            <Route path="/processes" element={<ProcessesPage />} />
            <Route path="/files" element={<FilesPage />} />
            <Route path="/terminal" element={<TerminalPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
