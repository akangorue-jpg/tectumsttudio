import { useEffect, type ReactNode } from 'react';
import type { ModuleSlug } from './i18n';
import { useT } from './i18n';
import { Shell } from './layout/Shell';
import { Link, RouterProvider, matchPath, useRouter, type RouterMode } from './lib/router';
import { SessionProvider, useSession } from './lib/session';
import { AuthPage } from './pages/Auth';
import { BuilderPage } from './pages/Builder';
import { DashboardPage } from './pages/Dashboard';
import { HistoryPage } from './pages/History';
import { ModulePage } from './pages/ModulePage';
import { ProjectDetailPage } from './pages/ProjectDetail';
import { ProjectsPage } from './pages/Projects';
import { SettingsPage } from './pages/Settings';
import { WizardPage } from './pages/Wizard';
import { Logo } from './ui/bits';
import { Card, EmptyState, Spinner } from './ui/kit';
import { ToastProvider } from './ui/overlay';

function resolve(path: string, onResetDemo: (() => void) | undefined, moduleSlugs: string[]): ReactNode {
  let params: Record<string, string> | null;
  if (path === '/') return <DashboardPage />;
  if (path === '/proyectos') return <ProjectsPage />;
  if (path === '/crear') return <WizardPage key="nuevo" />;
  if (path === '/ai-builder') return <BuilderPage />;
  if (path === '/historial') return <HistoryPage />;
  if (path === '/configuracion') return <SettingsPage onResetDemo={onResetDemo} />;
  if ((params = matchPath('/configuracion/:tab', path))) return <SettingsPage tab={params.tab} onResetDemo={onResetDemo} />;
  if ((params = matchPath('/proyectos/:id', path))) return <ProjectDetailPage key={params.id} id={params.id!} />;
  if ((params = matchPath('/proyectos/:id/blueprint', path))) return <ProjectDetailPage key={params.id} id={params.id!} initialTab="blueprint" />;
  if ((params = matchPath('/proyectos/:id/especificacion', path))) return <WizardPage key={params.id} projectId={params.id} />;
  if ((params = matchPath('/modulo/:slug', path)) && moduleSlugs.includes(params.slug!)) return <ModulePage slug={params.slug as ModuleSlug} />;
  return null;
}

function Routes({ onResetDemo }: { onResetDemo?: () => void }) {
  const t = useT();
  const { ready, user, setUser } = useSession();
  const { path, navigate } = useRouter();
  const isAuthPath = path === '/ingresar' || path === '/registro';

  useEffect(() => {
    if (ready && user && isAuthPath) navigate('/', { replace: true });
  }, [ready, user, isAuthPath, navigate]);

  if (!ready) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5">
        <Logo />
        <Spinner className="text-muted" />
      </div>
    );
  }
  if (!user) {
    return (
      <div className="h-full overflow-y-auto">
        <AuthPage key={path === '/registro' ? 'registro' : 'ingreso'} mode={path === '/registro' ? 'register' : 'login'} />
      </div>
    );
  }

  const reset = onResetDemo
    ? () => {
        onResetDemo();
        setUser(null);
        navigate('/registro', { replace: true });
      }
    : undefined;
  const page = resolve(isAuthPath ? '/' : path, reset, Object.keys(t.module.items));
  return (
    <Shell>
      {page ?? (
        <Card>
          <EmptyState
            title="404"
            text={t.project.notFoundText}
            action={
              <Link to="/" className="font-medium text-brand-ink hover:underline">
                {t.nav.dashboard}
              </Link>
            }
          />
        </Card>
      )}
    </Shell>
  );
}

export function App({ routerMode, onResetDemo }: { routerMode: RouterMode; onResetDemo?: () => void }) {
  return (
    <RouterProvider mode={routerMode}>
      <SessionProvider>
        <ToastProvider>
          <Routes onResetDemo={onResetDemo} />
        </ToastProvider>
      </SessionProvider>
    </RouterProvider>
  );
}
