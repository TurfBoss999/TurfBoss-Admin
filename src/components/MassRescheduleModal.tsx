'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import { formatVisitDate, todayLocalISO } from '@/lib/jobVisits';
import { RescheduleMode, ReschedulePreviewRow, RescheduleResult } from '@/types/database';

const supabase = getSupabaseBrowserClient();

// The database refuses more than this at once, so the page says so before asking
const MAX_JOBS = 500;

interface MassRescheduleModalProps {
  visitIds: string[];
  initialMode: RescheduleMode;
  onClose: () => void;
  // Called when the person chooses to look at the affected date. The list reloads from the database.
  onShowDate: (date: string) => void;
  // Called as soon as a batch has been applied, so the list can refresh behind the dialog
  onApplied: () => void;
}

type Step = 'form' | 'preview' | 'done';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function MassRescheduleModal({
  visitIds, initialMode, onClose, onShowDate, onApplied,
}: MassRescheduleModalProps) {
  const [step, setStep] = useState<Step>('form');
  const [mode, setMode] = useState<RescheduleMode>(initialMode);
  const [targetDate, setTargetDate] = useState('');
  const [carryCrews, setCarryCrews] = useState(false);
  const [rows, setRows] = useState<ReschedulePreviewRow[]>([]);
  const [result, setResult] = useState<RescheduleResult | null>(null);
  const [busy, setBusy] = useState(false);
  // Set on the first click of the confirm button and never cleared, so a double click
  // cannot create the batch twice
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedIds, setCopiedIds] = useState(false);

  const tooMany = visitIds.length > MAX_JOBS;
  const noneSelected = visitIds.length === 0;
  const inThePast = targetDate !== '' && targetDate < todayLocalISO();
  const args = {
    p_visit_ids: visitIds,
    p_target_date: targetDate,
    p_mode: mode,
    p_carry_crews: mode === 'copy' && carryCrews,
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  async function runPreview() {
    setError(null);
    setBusy(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('mass_reschedule_preview', args);
      if (rpcError) throw rpcError;
      setRows((data ?? []) as ReschedulePreviewRow[]);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : (err as { message?: string })?.message || 'Could not preview this batch.');
    } finally {
      setBusy(false);
    }
  }

  const doing = rows.filter((r) => r.action !== 'skip');
  const skipped = rows.filter((r) => r.action === 'skip');
  const subJobTotal = doing.reduce((sum, r) => sum + r.sub_job_count, 0);
  const crewsCarried = doing.reduce((sum, r) => sum + r.crews_carried, 0);
  const inactiveLeftOut = doing.reduce((sum, r) => sum + r.inactive_crews_skipped, 0);

  async function runApply() {
    if (submitted) return;
    setSubmitted(true);
    setError(null);
    setBusy(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('mass_reschedule_apply', args);
      if (rpcError) throw rpcError;
      setResult(data as RescheduleResult);
      setStep('done');
      onApplied();
    } catch (err) {
      // The whole batch is one transaction, so a failure means nothing changed. Allow a retry.
      setError(err instanceof Error ? err.message : (err as { message?: string })?.message || 'The batch could not be applied. Nothing was changed.');
      setSubmitted(false);
    } finally {
      setBusy(false);
    }
  }

  async function copyCreatedIds() {
    if (!result) return;
    const text = result.created.map((c) => c.new_job_id).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIds(true);
      setTimeout(() => setCopiedIds(false), 2000);
    } catch {
      window.prompt('Copy these Job ids:', result.created.map((c) => c.new_job_id).join(', '));
    }
  }

  const confirmLabel =
    mode === 'copy'
      ? `Create ${plural(doing.length, 'Job')} on ${targetDate ? formatVisitDate(targetDate) : ''}`
      : `Move ${plural(doing.length, 'Job')} to ${targetDate ? formatVisitDate(targetDate) : ''}`;

  const skippedList = (list: { address: string | null; reason: string | null; key: string }[]) => (
    <details className="mt-2 rounded-lg border border-gray-200 bg-gray-50">
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="mass-title">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="mass-title" className="text-lg font-semibold text-gray-900">
          {step === 'done' ? 'Done' : `Reschedule ${plural(visitIds.length, 'selected Job')}`}
        </h2>

        {/* ---------------- 1. choose ---------------- */}
        {step === 'form' && (
          <div className="mt-4 space-y-4">
            <fieldset>
              <legend className="text-sm font-medium text-gray-700">What to do</legend>
              <div className="mt-2 space-y-2">
                <label className="flex items-start gap-2 text-sm text-gray-800">
                  <input type="radio" name="mode" checked={mode === 'move'} onChange={() => setMode('move')} className="mt-1" />
                  <span><b>Move</b> to a new date. Only Jobs where every Sub Job is still scheduled can move. Crews stay on the Job.</span>
                </label>
                <label className="flex items-start gap-2 text-sm text-gray-800">
                  <input type="radio" name="mode" checked={mode === 'copy'} onChange={() => setMode('copy')} className="mt-1" />
                  <span><b>Copy</b> onto a new date. Works from any Job, even a finished one. The new Job starts fresh (scheduled, no crew unless you carry them, no visit photos or notes).</span>
                </label>
              </div>
            </fieldset>

            <div>
              <label htmlFor="target-date" className="block text-sm font-medium text-gray-700">New date</label>
              <input
                id="target-date"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
              {inThePast && (
                <p role="alert" className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">
                  That date is in the past. Crews will not see these Jobs as upcoming.
                </p>
              )}
            </div>

            {mode === 'copy' && (
              <label className="flex items-start gap-2 text-sm text-gray-800">
                <input type="checkbox" checked={carryCrews} onChange={(e) => setCarryCrews(e.target.checked)} className="mt-1" />
                <span>Also assign the same crews. Only active crews are carried; inactive ones are left off and counted. Leave this off to start with no crew.</span>
              </label>
            )}

            {noneSelected && (
              <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">
                No Jobs are selected. Close this and tick the Jobs you want to reschedule.
              </p>
            )}
            {tooMany && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
                {visitIds.length} Jobs are selected, but the limit is {MAX_JOBS} at a time. Narrow the selection and try again.
              </p>
            )}
            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>}

            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button
                onClick={runPreview}
                disabled={!targetDate || tooMany || noneSelected || busy}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? 'Checking...' : 'Preview'}
              </button>
            </div>
          </div>
        )}

        {/* ---------------- 2. preview ---------------- */}
        {step === 'preview' && (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800">
              <p>
                <b>{mode === 'copy' ? 'Copy' : 'Move'}</b> to <b>{formatVisitDate(targetDate)}</b>:
              </p>
              <ul className="mt-1 list-disc pl-5">
                <li>
                  {plural(doing.length, 'Job')} will be {mode === 'copy' ? 'created' : 'moved'}
                  {' '}({plural(subJobTotal, 'Sub Job')})
                </li>
                <li>{plural(skipped.length, 'Job')} will be skipped</li>
                {mode === 'copy' && carryCrews && (
                  <li>
                    {plural(crewsCarried, 'crew assignment')} carried
                    {inactiveLeftOut > 0 && `; ${plural(inactiveLeftOut, 'inactive crew')} left off`}
                  </li>
                )}
              </ul>
            </div>

            {inThePast && (
              <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">
                That date is in the past.
              </p>
            )}
            {skipped.length > 0 && skippedList(skipped.map((r) => ({ address: r.address, reason: r.reason, key: r.visit_id })))}
            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => { setStep('form'); setError(null); }} disabled={busy || submitted}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                Back
              </button>
              <button
                onClick={runApply}
                disabled={doing.length === 0 || busy || submitted}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitted ? 'Working...' : doing.length === 0 ? 'Nothing to do' : confirmLabel}
              </button>
            </div>
          </div>
        )}

        {/* ---------------- 3. result ---------------- */}
        {step === 'done' && result && (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
              {result.mode === 'copy' ? (
                <p>
                  Created <b>{plural(result.copied_jobs, 'Job')}</b> ({plural(result.created_sub_jobs, 'Sub Job')}) on{' '}
                  <b>{formatVisitDate(result.target_date)}</b>.
                  {result.crews_carried > 0 && ` ${plural(result.crews_carried, 'crew assignment')} carried.`}
                  {result.inactive_crews_skipped > 0 && ` ${plural(result.inactive_crews_skipped, 'inactive crew')} left off.`}
                </p>
              ) : (
                <p>
                  Moved <b>{plural(result.moved_jobs, 'Job')}</b> ({plural(result.moved_sub_jobs, 'Sub Job')}) to{' '}
                  <b>{formatVisitDate(result.target_date)}</b>.
                </p>
              )}
              <p className="mt-1">{result.skipped_count === 0 ? 'Nothing was skipped.' : `${plural(result.skipped_count, 'Job')} skipped.`}</p>
            </div>

            {doing.length !== result.moved_jobs + result.copied_jobs && (
              <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">
                Things changed between the preview and now, so the result differs from what was previewed ({doing.length}).
                The rules are checked again when the batch runs.
              </p>
            )}
            {result.skipped.length > 0 && skippedList(result.skipped.map((s) => ({ address: s.address, reason: s.reason, key: s.job_id })))}
            {result.created.length > 0 && (
              <details className="rounded-lg border border-gray-200 bg-gray-50">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-gray-700">
                  New Job ids ({result.created.length}). Keep these if the batch ever needs to be undone
                </summary>
                <div className="px-3 pb-3">
                  <button onClick={copyCreatedIds} className="mb-2 rounded-lg border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100">
                    {copiedIds ? 'Copied' : 'Copy all ids'}
                  </button>
                  <ul className="max-h-40 overflow-y-auto font-mono text-xs text-gray-600">
                    {result.created.map((c) => <li key={c.new_job_id}>{c.new_job_id}</li>)}
                  </ul>
                </div>
              </details>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Close</button>
              <button
                onClick={() => onShowDate(result.target_date)}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                Show Jobs on {formatVisitDate(result.target_date)}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
