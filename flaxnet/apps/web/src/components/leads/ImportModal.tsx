import { useState } from 'react';
import { importCsvMapped, uploadCsvPreview, type CsvUploadPreview } from '@/lib/api';

const MAP_FIELDS = [
  { key: 'address', label: 'Address', required: true },
  { key: 'city', label: 'City', required: false },
  { key: 'state', label: 'State', required: false },
  { key: 'zip', label: 'Zip', required: true },
  { key: 'firstName', label: 'Owner / first name', required: false },
  { key: 'phone', label: 'Phone', required: false },
] as const;

type Props = {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
};

export function ImportModal({ open, onClose, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CsvUploadPreview | null>(null);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [step, setStep] = useState<'pick' | 'map' | 'done'>('pick');
  const [result, setResult] = useState<{
    imported: number;
    duplicates: number;
    skippedInvalid: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function reset() {
    setFile(null);
    setPreview(null);
    setColumnMap({});
    setStep('pick');
    setResult(null);
    setErr(null);
    setLoading(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  if (!open) return null;

  async function onFilePicked(f: File) {
    setErr(null);
    setLoading(true);
    setFile(f);
    try {
      const p = await uploadCsvPreview(f);
      setPreview(p);
      const init: Record<string, string> = {};
      for (const f of MAP_FIELDS) {
        const match = p.columns.find(
          (c) =>
            c.toLowerCase().includes(f.key) ||
            (f.key === 'address' && /addr|street|property/i.test(c)) ||
            (f.key === 'zip' && /zip|postal/i.test(c)) ||
            (f.key === 'phone' && /phone|mobile|cell/i.test(c)) ||
            (f.key === 'firstName' && /owner|name/i.test(c))
        );
        if (match) init[f.key] = match;
      }
      setColumnMap(init);
      setStep('map');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function submitImport() {
    if (!file) return;
    for (const f of MAP_FIELDS) {
      if (f.required && !columnMap[f.key]?.trim()) {
        setErr(`Map ${f.label}`);
        return;
      }
    }
    setErr(null);
    setLoading(true);
    try {
      const r = await importCsvMapped(file, columnMap);
      setResult(r);
      setStep('done');
      onImported();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-4 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Import CSV</h2>
          <button type="button" onClick={handleClose} className="text-slate-400 hover:text-white">
            Close
          </button>
        </div>

        {err && <p className="mb-3 text-sm text-red-400">{err}</p>}

        {step === 'pick' && (
          <div>
            <label className="block text-sm text-slate-300">
              <span className="mb-1 block">Choose CSV</span>
              <input
                type="file"
                accept=".csv,text/csv"
                disabled={loading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFilePicked(f);
                }}
                className="text-sm text-slate-400"
              />
            </label>
            {loading && <p className="mt-2 text-sm text-slate-500">Reading…</p>}
          </div>
        )}

        {step === 'map' && preview && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              ~{preview.rowCount} rows · map columns to fields
            </p>
            {MAP_FIELDS.map((f) => (
              <label key={f.key} className="block text-sm">
                <span className="text-slate-400">
                  {f.label}
                  {f.required ? ' *' : ''}
                </span>
                <select
                  value={columnMap[f.key] ?? ''}
                  onChange={(e) => setColumnMap((m) => ({ ...m, [f.key]: e.target.value }))}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-white"
                >
                  <option value="">—</option>
                  {preview.columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => submitImport()}
                className="rounded bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {loading ? 'Importing…' : 'Import'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep('pick');
                  setPreview(null);
                  setFile(null);
                }}
                className="rounded border border-slate-600 px-3 py-2 text-sm text-slate-300"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {step === 'done' && result && (
          <div className="text-sm text-slate-300">
            <p>
              Imported <strong className="text-white">{result.imported}</strong> leads.
            </p>
            <p className="mt-1">
              Skipped duplicates: <strong className="text-white">{result.duplicates}</strong>
            </p>
            <p className="mt-1">
              Skipped (missing address/zip):{' '}
              <strong className="text-white">{result.skippedInvalid}</strong>
            </p>
            <button
              type="button"
              onClick={handleClose}
              className="mt-4 rounded bg-slate-700 px-3 py-2 text-white hover:bg-slate-600"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
