import { useCallback, useState, type ComponentType, type ReactNode } from 'react';
import {
  LuBot,
  LuChartColumn,
  LuCirclePlus,
  LuCodeXml,
  LuFolder,
  LuGitBranch,
  LuHistory,
  LuInfo,
  LuLayoutDashboard,
  LuLogOut,
  LuMenu,
  LuMoon,
  LuPencilRuler,
  LuPlug,
  LuRocket,
  LuSettings,
  LuSparkles,
  LuSquareKanban,
  LuSun,
  LuX,
} from 'react-icons/lu';
import type { User } from '../../core/types';
import { useT, type Messages } from '../i18n';
import { api } from '../lib/api';
import { initials } from '../lib/format';
import { errorMessage, useDismiss } from '../lib/hooks';
import { Link, useRouter } from '../lib/router';
import { useSession } from '../lib/session';
import { Logo } from '../ui/bits';
import { IconButton, cn } from '../ui/kit';
import { useToast } from '../ui/overlay';

type NavKey = Exclude<keyof Messages['nav'], 'groupBuild' | 'groupSolutions' | 'groupOperate'>;
interface NavItem {
  to: string;
  key: NavKey;
  icon: ComponentType<{ className?: string }>;
  /** Fase en la que se habilita; sin valor, la sección ya funciona. */
  phase?: number;
}

const NAV: { group: 'groupBuild' | 'groupSolutions' | 'groupOperate' | null; items: NavItem[] }[] = [
  {
    group: null,
    items: [
      { to: '/', key: 'dashboard', icon: LuLayoutDashboard },
      { to: '/proyectos', key: 'projects', icon: LuFolder },
      { to: '/crear', key: 'create', icon: LuCirclePlus },
    ],
  },
  {
    group: 'groupBuild',
    items: [
      { to: '/ai-builder', key: 'builder', icon: LuSparkles },
      { to: '/modulo/editor-visual', key: 'visualEditor', icon: LuPencilRuler, phase: 3 },
      { to: '/modulo/code-editor', key: 'codeEditor', icon: LuCodeXml, phase: 4 },
      { to: '/modulo/aura', key: 'aura', icon: LuBot, phase: 5 },
    ],
  },
  {
    group: 'groupSolutions',
    items: [
      { to: '/modulo/project-management', key: 'pm', icon: LuSquareKanban, phase: 7 },
      { to: '/modulo/data-analytics', key: 'data', icon: LuChartColumn, phase: 7 },
    ],
  },
  {
    group: 'groupOperate',
    items: [
      { to: '/modulo/version-control', key: 'vcs', icon: LuGitBranch, phase: 6 },
      { to: '/modulo/integraciones', key: 'integrations', icon: LuPlug, phase: 6 },
      { to: '/modulo/deployment', key: 'deployment', icon: LuRocket, phase: 8 },
      { to: '/historial', key: 'history', icon: LuHistory },
    ],
  },
];

const isActive = (path: string, to: string) => (to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`));

function NavLink({ item, path, onNavigate }: { item: NavItem; path: string; onNavigate(): void }) {
  const t = useT();
  const active = isActive(path, item.to);
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      onNavigate={onNavigate}
      className={cn(
        'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] transition-colors',
        active ? 'bg-brand-soft font-medium text-brand-ink' : 'text-ink/80 hover:bg-subtle hover:text-ink',
      )}
    >
      <Icon className={cn('size-4 shrink-0', active ? 'text-brand-ink' : 'text-muted')} />
      <span className="min-w-0 flex-1 truncate">{t.nav[item.key] as string}</span>
      {item.phase && <span className="rounded border border-line px-1 text-[10.5px] leading-4 text-muted">{t.common.phase(item.phase)}</span>}
    </Link>
  );
}

function Sidebar({ path, onNavigate }: { path: string; onNavigate(): void }) {
  const t = useT();
  return (
    <div className="flex h-full w-64 flex-col border-r border-line bg-surface">
      <div className="flex h-14 shrink-0 items-center px-4">
        <Link to="/" onNavigate={onNavigate}>
          <Logo />
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-2.5 pt-1 pb-3" aria-label={t.brand.name}>
        {NAV.map((section, index) => (
          <div key={index} className="flex flex-col gap-0.5">
            {section.group && <p className="px-2.5 pb-1 text-xs font-medium text-muted">{t.nav[section.group]}</p>}
            {section.items.map((item) => (
              <NavLink key={item.to} item={item} path={path} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>
      <div className="border-t border-line p-2.5">
        <NavLink item={{ to: '/configuracion', key: 'settings', icon: LuSettings }} path={path} onNavigate={onNavigate} />
      </div>
    </div>
  );
}

function UserMenu({ user }: { user: User }) {
  const t = useT();
  const { logout } = useSession();
  const { navigate } = useRouter();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={user.name}
        className="flex size-8 items-center justify-center rounded-full bg-ink text-xs font-semibold text-surface"
      >
        {initials(user.name)}
      </button>
      {open && (
        <div role="menu" className="absolute top-10 right-0 z-40 w-60 animate-[rise_0.12s_ease-out] rounded-lg border border-line bg-surface p-1 shadow-pop">
          <div className="border-b border-line px-3 py-2">
            <p className="truncate font-medium">{user.name}</p>
            <p className="truncate text-[13px] text-muted">{user.email}</p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              close();
              navigate('/configuracion');
            }}
            className="mt-1 flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-sm hover:bg-subtle"
          >
            <LuSettings className="size-4 text-muted" /> {t.nav.settings}
          </button>
          <button type="button" role="menuitem" onClick={() => void logout()} className="flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-sm hover:bg-subtle">
            <LuLogOut className="size-4 text-muted" /> {t.nav.logout}
          </button>
        </div>
      )}
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const t = useT();
  const { path } = useRouter();
  const { user, setUser, meta, ai } = useSession();
  const toast = useToast();
  const [drawer, setDrawer] = useState(false);
  const closeDrawer = useCallback(() => setDrawer(false), []);
  if (!user) return null;

  const toggleTheme = async () => {
    const theme = user.theme === 'oscuro' ? 'claro' : 'oscuro';
    setUser({ ...user, theme });
    try {
      await api.patch('/api/auth/me', { theme });
    } catch (cause) {
      setUser(user);
      toast.error(errorMessage(cause));
    }
  };

  return (
    <div className="flex h-full">
      <aside className="hidden lg:block">
        <Sidebar path={path} onNavigate={closeDrawer} />
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/40 dark:bg-black/60" onClick={closeDrawer} />
          <div className="relative h-full w-64 shadow-pop">
            <Sidebar path={path} onNavigate={closeDrawer} />
            <IconButton label={t.nav.closeMenu} onClick={closeDrawer} className="absolute top-3 -right-10 bg-surface">
              <LuX className="size-4" />
            </IconButton>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-3 lg:px-6">
          <IconButton label={t.nav.openMenu} onClick={() => setDrawer(true)} className="lg:hidden">
            <LuMenu className="size-5" />
          </IconButton>
          <Link to="/" className="lg:hidden">
            <Logo compact />
          </Link>
          <div className="flex-1" />
          <Link
            to="/configuracion/proveedores"
            title={t.nav.aiTitle}
            className="hidden h-8 items-center gap-2 rounded-md border border-line px-2.5 text-[13px] text-muted transition-colors hover:bg-subtle hover:text-ink sm:flex"
          >
            <span className={cn('size-1.5 rounded-full', ai ? 'bg-teal' : 'bg-line-strong')} />
            <span className="max-w-56 truncate">{ai ? ai.label : t.nav.aiLocal}</span>
          </Link>
          <IconButton label={user.theme === 'oscuro' ? t.nav.themeToLight : t.nav.themeToDark} onClick={() => void toggleTheme()}>
            {user.theme === 'oscuro' ? <LuSun className="size-4" /> : <LuMoon className="size-4" />}
          </IconButton>
          <UserMenu user={user} />
        </header>

        {meta?.mode === 'demo' && (
          <div className="flex items-center justify-center gap-2 border-b border-line bg-brand-soft px-4 py-1.5 text-center text-[13px] text-brand-ink">
            <LuInfo className="size-3.5 shrink-0" />
            {t.common.demoBanner}
          </div>
        )}

        <main id="contenido" className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
