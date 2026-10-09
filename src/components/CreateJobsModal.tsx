'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import { formatVisitDate, todayLocalISO } from '@/lib/jobVisits';
import { CreateJobsPreviewRow, CreateJobsResult } from '@/types/database';

const supabase = getSupabaseBrowserClient();

// The database refuses more than this at once, so the page says so before asking
const MAX_PROPERTIES = 500;

interface CreateJobsModalProps {
  propertyIds: string[];
  onClose: () => void;
  // Called as soon as the batch has been applied, so the list can refresh behind the dialog
  onApplied: () => void;
}

type Step = 'form' | 'preview' | 'done';

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

export default function CreateJobsModal({ propertyIds, onClose, onApplied }: CreateJobsModalProps) {
  const [step, setStep] = useState<Step>('form');
  const [targetDate, setTargetDate] = useState('');
  const [rows, setRows] = useState<CreateJobsPreviewRow[]>([]);
  const [result, setResult] = useState<CreateJobsResult | null>(null);
  const [busy, setBusy] = useState(false);
  // Set on the first click of the confirm button and never cleared, so a double click
  // cannot create the batch twice
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooMany = propertyIds.length > MAX_PROPERTIES;
  const noneSelected = propertyIds.length === 0;
  const inThePast = targetDate !== '' && targetDate < todayLocalISO();
  const args = { p_property_ids: propertyIds, p_date: targetDate };

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
      const { data, error: rpcError } = await supabase.rpc('create_jobs_for_date_preview', args);
      if (rpcError) throw rpcError;
      setRows((data ?? []) as CreateJobsPreviewRow[]);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : (err as { message?: string })?.message || 'Could not preview this batch.');
    } finally {
      setBusy(false);
    }
  }

  const creating = rows.filter((r) => r.action === 'create');
  const skipped = rows.filter((r) => r.action === 'skip');
  const subJobTotal = creating.reduce((sum, r) => sum + r.service_count, 0);

  async function runApply() {
    if (submitted) return;
    setSubmitted(true);
    setError(null);
    setBusy(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('create_jobs_for_date_apply', args);
      if (rpcError) throw rpcError;
      setResult(data as CreateJobsResult);
      setStep('done');
      onApplied();
    } catch (err) {
      // The whole batch is one transaction, so a failure means nothing changed. Allow a retry.
      setError(err instanceof Error ? err.message : (err as { message?: string })?.message || 'The batch could not be created. Nothing was changed.');
      setSubmitted(false);
    } finally {
      setBusy(false);
    }
  }

  const skippedList = (list: { address: string | null; reason: string | null; key: string }[]) => (
    <details className="mt-2 rounded-lg border border-gray-200 bg-gray-50">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-gray-700">
        Skipped properties ({list.length}): show why
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="create-title">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="create-title" className="text-lg font-semibold text-gray-900">
          {step === 'done' ? 'Done' : `Create Jobs for ${plural(propertyIds.length, 'selected property', 'selected properties')}`}
        </h2>

        {/* ---------------- 1. choose a date ---------------- */}
        {step === 'form' && (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-gray-700">
              Makes one Job per property on the date you choose, with that property&apos;s default services
              (scheduled, no crew). Properties with no default services, or that already have a Job that day, are skipped.
              Crews are assigned afterwards in the route planner.
            </p>
            <div>
              <label htmlFor="create-date" className="block text-sm font-medium text-gray-700">Date</label>
              <input
                id="create-date"
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

            {noneSelected && (
              <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">
                No properties are selected. Close this and tick the properties you want Jobs for.
              </p>
            )}
            {tooMany && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
                {propertyIds.length} properties are selected, but the limit is {MAX_PROPERTIES} at a time. Narrow the selection and try again.
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
                On <b>{formatVisitDate(targetDate)}</b>:
              </p>
              <ul className="mt-1 list-disc pl-5">
                <li>
                  {plural(creating.length, 'Job')} will be created ({plural(subJobTotal, 'Sub Job')})
                </li>
                <li>{plural(skipped.length, 'property', 'properties')} will be skipped</li>
              </ul>
            </div>

            {inThePast && (
              <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">
                That date is in the past.
              </p>
            )}
            {skipped.length > 0 && skippedList(skipped.map((r) => ({ address: r.address, reason: r.reason, key: r.property_id })))}
            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => { setStep('form'); setError(null); }} disabled={busy || submitted}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                Back
              </button>
              <button
                onClick={runApply}
                disabled={creating.length === 0 || busy || submitted}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitted ? 'Working...' : creating.length === 0 ? 'Nothing to do' : `Create ${plural(creating.length, 'Job')} on ${formatVisitDate(targetDate)}`}
              </button>
            </div>
          </div>
        )}

        {/* ---------------- 3. result ---------------- */}
        {step === 'done' && result && (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
              <p>
                Created <b>{plural(result.created_jobs, 'Job')}</b> ({plural(result.created_sub_jobs, 'Sub Job')}) on{' '}
                <b>{formatVisitDate(result.target_date)}</b>.
              </p>
              <p className="mt-1">
                {result.skipped_count === 0 ? 'Nothing was skipped.' : `${plural(result.skipped_count, 'property', 'properties')} skipped.`}
              </p>
            </div>

            {creating.length !== result.created_jobs && (
              <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">
                Things changed between the preview and now, so the result differs from what was previewed ({creating.length}).
                The rules are checked again when the batch runs.
              </p>
            )}
            {result.skipped.length > 0 && skippedList(result.skipped.map((s) => ({ address: s.address, reason: s.reason, key: s.property_id })))}

            <p className="text-sm text-gray-700">
              No crews are assigned yet. Open the route planner to group these Jobs and assign trucks.
            </p>

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Close</button>
              <Link
                href={`/dashboard/routes?date=${result.target_date}`}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                Plan routes for {formatVisitDate(result.target_date)}
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
