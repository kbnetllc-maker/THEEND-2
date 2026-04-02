export default function Pipeline() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-white">Pipeline</h1>
      <p className="mt-2 text-slate-400">Kanban + @dnd-kit — scaffold stage; drag cards next.</p>
      <div className="mt-6 flex gap-3 overflow-x-auto">
        {['New', 'Contacted', 'Offer', 'Contract'].map((c) => (
          <div key={c} className="min-h-64 w-64 shrink-0 rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            <h2 className="font-medium text-slate-200">{c}</h2>
            <p className="mt-2 text-xs text-slate-500">Drop leads here</p>
          </div>
        ))}
      </div>
    </div>
  );
}
