import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { onUpgradeRequired } from '@/lib/api';

export function UpgradeModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    return onUpgradeRequired(() => setOpen(true));
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-w-md rounded-lg border border-slate-700 bg-slate-900 p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-white">Upgrade to continue</h2>
        <p className="mt-2 text-sm text-slate-400">
          You&apos;ve reached your limit. Upgrade to continue importing lists, starting conversations, and running
          automation.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            to="/settings/billing"
            onClick={() => setOpen(false)}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            View plans
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
