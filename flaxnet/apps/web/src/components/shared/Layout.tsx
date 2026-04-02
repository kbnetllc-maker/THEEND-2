import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  OrganizationSwitcher,
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
  useAuth,
} from '@clerk/clerk-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { clearImpersonation, fetchAdminCapabilities, getImpersonationFromStorage, setAuthToken } from '@/lib/api';
import { UpgradeModal } from '@/components/shared/UpgradeModal';

type NavItem = { to: string; label: string };
type NavSection = { title: string; items: NavItem[] };

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Overview',
    items: [{ to: '/dashboard', label: 'Dashboard' }],
  },
  {
    title: 'Pipeline',
    items: [
      { to: '/leads', label: 'Opportunities' },
      { to: '/pipeline', label: 'Board' },
      { to: '/conversations', label: 'Conversations' },
    ],
  },
  {
    title: 'Tools',
    items: [
      { to: '/tasks', label: 'Tasks' },
      { to: '/automations', label: 'Automations' },
      { to: '/tools/deal-analyzer', label: 'Deal analyzer' },
    ],
  },
  {
    title: 'Account',
    items: [{ to: '/settings', label: 'Settings' }],
  },
];

function navItemActive(pathname: string, to: string): boolean {
  if (to === '/settings') return pathname.startsWith('/settings');
  return pathname === to || pathname.startsWith(`${to}/`);
}

function NavSectionBlock({
  title,
  items,
  pathname,
}: {
  title: string;
  items: NavItem[];
  pathname: string;
}) {
  return (
    <div className="mb-5">
      <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      <div className="flex flex-col gap-0.5">
        {items.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={`rounded-md px-2 py-2 text-sm transition-colors hover:bg-slate-800 ${
              navItemActive(pathname, item.to) ? 'bg-slate-800 text-white' : 'text-slate-300'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function ClerkHeader() {
  const { getToken } = useAuth();
  const loc = useLocation();
  useEffect(() => {
    void (async () => {
      const t = await getToken();
      setAuthToken(t);
    })();
  }, [getToken, loc.pathname]);
  return (
    <>
      <SignedIn>
        <UserButton afterSignOutUrl="/" />
      </SignedIn>
      <SignedOut>
        <SignInButton mode="modal">
          <button type="button" className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium">
            Sign in
          </button>
        </SignInButton>
      </SignedOut>
    </>
  );
}

export function Layout() {
  const loc = useLocation();
  const clerkPk = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

  const adminQ = useQuery({
    queryKey: ['admin', 'capabilities'],
    queryFn: fetchAdminCapabilities,
    enabled: Boolean(clerkPk),
    retry: false,
  });

  const [impersonation, setImpersonationState] = useState(() => getImpersonationFromStorage());
  useEffect(() => {
    const sync = () => setImpersonationState(getImpersonationFromStorage());
    window.addEventListener('flaxnet-impersonation', sync);
    const t = window.setInterval(sync, 60_000);
    return () => {
      window.removeEventListener('flaxnet-impersonation', sync);
      window.clearInterval(t);
    };
  }, []);

  const sections: NavSection[] = [...NAV_SECTIONS];
  if (adminQ.isSuccess) {
    sections.push({ title: 'Admin', items: [{ to: '/admin', label: 'Admin panel' }] });
  }

  return (
    <div className="flex min-h-screen bg-slate-950">
      <UpgradeModal />
      <aside className="w-56 shrink-0 border-r border-slate-800 bg-slate-900/80">
        <div className="p-3">
          <Link to="/dashboard" className="font-bold text-indigo-400 hover:text-indigo-300">
            Flaxnet
          </Link>
        </div>
        <nav className="px-2 pb-4">
          {sections.map((s) => (
            <NavSectionBlock key={s.title} title={s.title} items={s.items} pathname={loc.pathname} />
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {impersonation ? (
          <div className="flex items-center justify-between gap-3 border-b border-amber-900/50 bg-amber-950/40 px-4 py-2 text-sm text-amber-100">
            <span>
              You are viewing as <strong>{impersonation.workspaceName}</strong>
            </span>
            <button
              type="button"
              className="rounded border border-amber-800/80 px-2 py-0.5 text-xs hover:bg-amber-900/40"
              onClick={() => {
                clearImpersonation();
                setImpersonationState(null);
              }}
            >
              Exit
            </button>
          </div>
        ) : null}
        <header className="flex items-center justify-end gap-3 border-b border-slate-800 px-4 py-2">
          {clerkPk ? (
            <>
              <SignedIn>
                <OrganizationSwitcher
                  appearance={{ elements: { rootBox: 'flex items-center' } }}
                  afterCreateOrganizationUrl="/settings/billing"
                />
              </SignedIn>
              <ClerkHeader />
            </>
          ) : (
            <span className="text-xs text-amber-400/90">Dev mode — API via Vite proxy (/api → :4000)</span>
          )}
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
