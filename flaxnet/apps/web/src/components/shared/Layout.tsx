import { Link, Outlet, useLocation } from 'react-router-dom';
import { SignedIn, SignedOut, SignInButton, UserButton, useAuth } from '@clerk/clerk-react';
import { useEffect } from 'react';
import { setAuthToken } from '@/lib/api';
import { useUiStore } from '@/stores/uiStore';

const nav = [
  { to: '/', label: 'Dashboard' },
  { to: '/leads', label: 'Leads' },
  { to: '/pipeline', label: 'Pipeline' },
  { to: '/conversations', label: 'Conversations' },
  { to: '/deals', label: 'Deal Analyzer' },
  { to: '/tasks', label: 'Tasks' },
  { to: '/settings', label: 'Settings' },
];

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
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  const loc = useLocation();
  const clerkPk = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

  return (
    <div className="flex min-h-screen">
      <aside
        className={`border-r border-slate-800 bg-slate-900/80 ${collapsed ? 'w-16' : 'w-56'} shrink-0 transition-all`}
      >
        <div className="flex items-center justify-between p-3">
          {!collapsed && <span className="font-bold text-indigo-400">Flaxnet</span>}
          <button type="button" onClick={toggle} className="text-xs text-slate-500">
            {collapsed ? '»' : '«'}
          </button>
        </div>
        <nav className="flex flex-col gap-1 px-2 pb-4">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`rounded-md px-2 py-2 text-sm hover:bg-slate-800 ${
                loc.pathname === item.to ? 'bg-slate-800 text-white' : 'text-slate-300'
              }`}
            >
              {!collapsed ? item.label : item.label[0]}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 border-b border-slate-800 px-4 py-2">
          {clerkPk ? (
            <ClerkHeader />
          ) : (
            <span className="text-xs text-amber-400/90">Set VITE_CLERK_PUBLISHABLE_KEY for auth</span>
          )}
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
