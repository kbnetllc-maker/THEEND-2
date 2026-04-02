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

const baseNav = [
  { to: '/leads', label: 'Opportunities' },
  { to: '/pipeline', label: 'Pipeline' },
  { to: '/settings', label: 'Settings' },
] as const;

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

  const nav = adminQ.isSuccess
    ? [...baseNav, { to: '/admin' as const, label: 'Admin' }]
    : [...baseNav];

  return (
    <div className="flex min-h-screen bg-slate-950">
      <UpgradeModal />
      <aside className="w-56 shrink-0 border-r border-slate-800 bg-slate-900/80">
        <div className="p-3">
          <span className="font-bold text-indigo-400">Flaxnet</span>
        </div>
        <nav className="flex flex-col gap-1 px-2 pb-4">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`rounded-md px-2 py-2 text-sm hover:bg-slate-800 ${
                loc.pathname === item.to || loc.pathname.startsWith(`${item.to}/`)
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-300'
              }`}
            >
              {item.label}
            </Link>
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
            <span className="text-xs text-amber-400/90">Dev mode — optional VITE_CLERK_PUBLISHABLE_KEY</span>
          )}
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
