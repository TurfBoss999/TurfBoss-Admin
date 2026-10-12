'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import { formatVisitDate } from '@/lib/jobVisits';
import { DeleteJobsPreviewRow, DeleteJobsResult } from '@/types/database';

const supabase = getSupabaseBrowserClient();

// The database refuses more than this at once, so the page says so before asking
const MAX_JOBS = 500;

interface DeleteJobsModalProps {
  visitIds: string[];
  // Set when deleting one Job from its own page: the confirmation then names this address and date
  single?: { address: string; date: string };
  onClose: () => void;
  // Called as soon as the delete has been applied, so the list behind the dialog can refresh
  onApplied: (result: DeleteJobsResult) => void;
}

type Step = 'checking' | 'confirm' | 'done';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function DeleteJobsModal({ visitIds, single, onClose, onApplied }: DeleteJobsModalProps) {
  const [step, setStep] = useState<Step>('checking');
  const [rows, setRows] = useState<DeleteJobsPreviewRow[]>([]);
  const [result, setResult] = useState<DeleteJobsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Set on the first click of the confirm button and only cleared if the delete failed, so a
  // double click cannot run it twice
  const [submitted, setSubmitted] = useState(false);

  const tooMany = visitIds.length > MAX_JOBS;
  const args = { p_visit_ids: visitIds };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  // The preview runs as soon as the dialog opens: there is nothing to choose first
  useEffect(() => {
    if (tooMany || visitIds.length === 0) {
      setStep('confirm');
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error: rpcError } = await supabase.rpc('delete_jobs_preview', args);
      if (cancelled) return;
      if (rpcError) {
        setError(rpcError.message || 'Could not check these Jobs.');
      } else {
        setRows((data ?? []) as DeleteJobsPreviewRow[]);
      }
      setStep('confirm');
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleting = rows.filter((r) => r.action === 'delete');
  const skipped = rows.filter((r) => r.action === 'skip');
  const serviceTotal = deleting.reduce((sum, r) => sum + r.service_count, 0);

  async function runApply() {
    if (submitted) return;
    setSubmitted(true);
    setError(null);
    setBusy(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('delete_jobs_apply', args);
      if (rpcError) throw rpcError;
      const res = data as DeleteJobsResult;
      setResult(res);
      setStep('done');
      onApplied(res);
    } catch (err) {
      // One transaction: a failure means nothing was deleted. Allow another try.
      setError(err instanceof Error ? err.message : (err as { message?: string })?.message || 'The delete failed. Nothing was deleted.');
      setSubmitted(false);
    } finally {
      setBusy(false);
    }
  }

  const skippedList = (list: { address: string | null; reason: string | null; key: string }[]) => (
    <details className="mt-2 rounded-lg border border-gray-200 bg-gray-50" open={!!single}>
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-gray-700">
        Skipped Jobs ({list.length}): show why
      </summary>
      <ul className="max-h-48 divide-y divide-gray-200 overflow-y-auto px-3 pb-2 text-sm">
        {list.map((s) => (
          <li key={s.key} className="py-1.5">
            <span className="font-medium text-gray-900">{s.address || 'Unknown property'}</span>
            <span className="block text-gray-600">{s.reason}</span>
          </li>
        ))}
      </ul>
    </details>
  );

  const confirmLabel = single ? 'Delete this Job' : `Delete ${plural(deleting.length, 'Job')}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-title">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="delete-title" className="text-lg font-semibold text-gray-900">
          {step === 'done' ? 'Done' : single ? 'Delete this Job?' : `Delete ${plural(visitIds.length, 'selected Job')}`}
        </h2>

        {step === 'checking' && <p className="mt-4 text-sm text-gray-600">Checking what can be deleted...</p>}

        {step === 'confirm' && (
          <div className="mt-4 space-y-3">
            {tooMany && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
                {visitIds.length} Jobs are selected, but the limit is {MAX_JOBS} at a time. Narrow the selection and try again.
              </p>
            )}

            {!tooMany && !error && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800">
                {single ? (
                  deleting.length === 1 ? (
                    <p>
                      This permanently deletes the Job at <b>{single.address}</b> on <b>{formatVisitDate(single.date, true)}</b>
                      {' '}with its {plural(serviceTotal, 'service')} and {plural(deleting[0].crew_count, 'crew assignment')}. It cannot be undone.
                    </p>
                  ) : (
                    <p>This Job cannot be deleted.</p>
                  )
                ) : (
                  <ul className="list-disc pl-5">
                    <li>{plural(deleting.length, 'Job')} will be deleted ({plural(serviceTotal, 'service')})</li>
                    <li>{plural(skipped.length, 'Job')} will be skipped</li>
                    <li>This cannot be undone.</li>
                  </ul>
                )}
              </div>
            )}

            {skipped.length > 0 && skippedList(skipped.map((r) => ({ address: r.address, reason: r.reason, key: r.visit_id })))}
            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} disabled={busy} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                Cancel
              </button>
              <button
                onClick={runApply}
                disabled={deleting.length === 0 || busy || submitted || tooMany}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitted ? 'Deleting...' : deleting.length === 0 ? 'Nothing to delete' : confirmLabel}
              </button>
            </div>
          </div>
        )}

        {step === 'done' && result && (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
              <p>
                Deleted <b>{plural(result.deleted_jobs, 'Job')}</b> ({plural(result.deleted_sub_jobs, 'service')}).
              </p>
              <p className="mt-1">{result.skipped_count === 0 ? 'Nothing was skipped.' : `${plural(result.skipped_count, 'Job')} skipped.`}</p>
            </div>
            {deleting.length !== result.deleted_jobs && (
              <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">
                Things changed between the check and now, so the result differs from what was shown ({deleting.length}). The rules are checked again when the delete runs.
              </p>
            )}
            {result.skipped.length > 0 && skippedList(result.skipped.map((s) => ({ address: s.address, reason: s.reason, key: s.job_id })))}
            <div className="flex justify-end pt-1">
              <button onClick={onClose} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
