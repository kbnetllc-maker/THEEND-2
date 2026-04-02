import { Link, Outlet, useLocation } from 'react-router-dom';

const links = [{ to: '/settings/billing', label: 'Billing' }];

export default function Settings() {
  const loc = useLocation();
  const atRoot = loc.pathname === '/settings';

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white">Settings</h1>
      <p className="mt-2 text-slate-400">Workspace, billing, and team preferences.</p>

      <nav className="mt-6 flex gap-2 border-b border-slate-800 pb-2">
        {links.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className={`rounded-md px-3 py-1.5 text-sm ${
              loc.pathname.startsWith(l.to) ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {l.label}
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        {atRoot ? (
          <p className="text-sm text-slate-500">
            Choose a section above, or go to{' '}
            <Link to="/settings/billing" className="text-indigo-400 hover:underline">
              Billing
            </Link>
            .
          </p>
        ) : (
          <Outlet />
        )}
      </div>
    </div>
  );
}
