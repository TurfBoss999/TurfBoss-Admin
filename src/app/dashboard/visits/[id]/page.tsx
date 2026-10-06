'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import {
  Crew,
  JobStatus,
  JobVisitWithDetails,
  JobWithCrew,
  SERVICE_TYPE_LABELS,
} from '@/types/database';
import StatusBadge from '@/components/StatusBadge';
import {
  badgeStatus,
  formatVisitDate,
  isAvailable,
  visitStatus,
} from '@/lib/jobVisits';

const supabase = getSupabaseBrowserClient();

const VISIT_SELECT =
  '*, property:properties(*), crews:job_visit_crews(crew:crews(*)), jobs(*, crew:crews(*))';

const STATUS_DISPLAY: Record<JobStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export default function JobVisitPage() {
  const params = useParams();
  const id = params.id as string;

  const [visit, setVisit] = useState<JobVisitWithDetails | null>(null);
  const [allCrews, setAllCrews] = useState<Crew[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [crewError, setCrewError] = useState<string | null>(null);
  const [crewBusy, setCrewBusy] = useState(false);
  const [crewToAdd, setCrewToAdd] = useState('');

  const [updatingJobId, setUpdatingJobId] = useState<string | null>(null);
  const [copiedStatusLink, setCopiedStatusLink] = useState(false);

  const [showDateModal, setShowDateModal] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [dateError, setDateError] = useState<string | null>(null);
  const [conflictVisitId, setConflictVisitId] = useState<string | null>(null);
  const [savingDate, setSavingDate] = useState(false);

  const fetchVisit = useCallback(async () => {
    const [visitResult, crewsResult] = await Promise.all([
      supabase.from('job_visits').select(VISIT_SELECT).eq('id', id).maybeSingle(),
      supabase.from('crews').select('*').order('name', { ascending: true }),
    ]);

    if (visitResult.error) throw visitResult.error;
    if (crewsResult.error) throw crewsResult.error;

    setVisit((visitResult.data as JobVisitWithDetails | null) ?? null);
    setAllCrews((crewsResult.data as Crew[]) || []);
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        await fetchVisit();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load this Job');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchVisit]);

  const assignedCrews = (visit?.crews || [])
    .map((c) => c.crew)
    .filter((c): c is Crew => !!c)
    .sort((a, b) => a.name.localeCompare(b.name));
  const assignedIds = new Set(assignedCrews.map((c) => c.id));
  const addableCrews = allCrews.filter((c) => !assignedIds.has(c.id));

  async function handleAddCrew() {
    if (!visit || !crewToAdd) return;
    setCrewError(null);
    setCrewBusy(true);
    try {
      const { error: insertError } = await supabase
        .from('job_visit_crews')
        .upsert(
          { job_visit_id: visit.id, crew_id: crewToAdd },
          { onConflict: 'job_visit_id,crew_id', ignoreDuplicates: true }
        );
      if (insertError) throw insertError;
      setCrewToAdd('');
      await fetchVisit();
    } catch (err) {
      setCrewError(err instanceof Error ? err.message : 'Failed to add crew');
    } finally {
      setCrewBusy(false);
    }
  }

  async function handleRemoveCrew(crew: Crew) {
    if (!visit) return;
    setCrewError(null);

    // A crew that has claimed Sub Jobs here would lose sight of its own finished
    // work in the Crew app if it were unlinked from the Job, so block it.
    const claimed = visit.jobs.filter((j) => j.crew_id === crew.id);
    if (claimed.length > 0) {
      setCrewError(
        `${crew.name} has claimed ${claimed.length} Sub Job${claimed.length !== 1 ? 's' : ''} on this Job, so it can't be removed. Removing it would hide its own work from it.`
      );
      return;
    }

    setCrewBusy(true);
    try {
      const { error: deleteError } = await supabase
        .from('job_visit_crews')
        .delete()
        .eq('job_visit_id', visit.id)
        .eq('crew_id', crew.id);
      if (deleteError) throw deleteError;
      await fetchVisit();
    } catch (err) {
      setCrewError(err instanceof Error ? err.message : 'Failed to remove crew');
    } finally {
      setCrewBusy(false);
    }
  }

  async function handleStatusChange(job: JobWithCrew, status: JobStatus) {
    if (job.status === status) return;
    setUpdatingJobId(job.id);
    try {
      const { error: updateError } = await supabase
        .from('jobs')
        // Back to Scheduled releases the claim, so any crew on the Job can pick it up again.
        .update({
          status,
          updated_at: new Date().toISOString(),
          ...(status === 'scheduled' ? { crew_id: null } : {}),
        })
        .eq('id', job.id);
      if (updateError) throw updateError;
      await fetchVisit();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setUpdatingJobId(null);
    }
  }

  function openDateModal() {
    if (!visit) return;
    setNewDate(visit.date);
    setDateError(null);
    setConflictVisitId(null);
    setShowDateModal(true);
  }

  // The date belongs to the Job, so every Sub Job moves with it. The jobs table
  // still carries its own date column (the status page, reports and the Crew app
  // read it), so both are updated. The visit goes first because its
  // UNIQUE (property_id, date) is what catches a clash before anything else changes.
  async function handleSaveDate() {
    if (!visit || !newDate || newDate === visit.date) {
      setShowDateModal(false);
      return;
    }
    setDateError(null);
    setConflictVisitId(null);
    setSavingDate(true);

    const oldDate = visit.date;
    try {
      const { data: clash, error: clashError } = await supabase
        .from('job_visits')
        .select('id')
        .eq('property_id', visit.property_id)
        .eq('date', newDate)
        .neq('id', visit.id)
        .maybeSingle();
      if (clashError) throw clashError;
      if (clash) {
        setConflictVisitId(clash.id);
        setDateError('This property already has a Job on that date. Open it instead of moving this one onto it.');
        return;
      }

      const { error: visitError } = await supabase
        .from('job_visits')
        .update({ date: newDate })
        .eq('id', visit.id);
      if (visitError) throw visitError;

      const { error: jobsError } = await supabase
        .from('jobs')
        .update({ date: newDate, updated_at: new Date().toISOString() })
        .eq('job_visit_id', visit.id);

      if (jobsError) {
        await supabase.from('job_visits').update({ date: oldDate }).eq('id', visit.id);
        throw jobsError;
      }

      await fetchVisit();
      setShowDateModal(false);
    } catch (err) {
      setDateError(err instanceof Error ? err.message : 'Failed to change the date');
    } finally {
      setSavingDate(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center space-x-2">
          <svg className="h-6 w-6 animate-spin text-green-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-gray-600">Loading job...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-6 text-center">
        <p className="text-red-600">{error}</p>
        <Link href="/dashboard/sites" className="mt-4 inline-block text-red-700 underline">
          Back to Jobs
        </Link>
      </div>
    );
  }

  if (!visit) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
        <p className="text-gray-600">Job not found.</p>
        <Link href="/dashboard/sites" className="mt-4 inline-block text-green-600 hover:text-green-700 font-medium">
          Back to Jobs
        </Link>
      </div>
    );
  }

  const address = visit.property?.address || visit.jobs[0]?.address || 'Unknown property';
  const subJobs = [...visit.jobs].sort((a, b) =>
    SERVICE_TYPE_LABELS[a.service_type].localeCompare(SERVICE_TYPE_LABELS[b.service_type])
  );
  const status = visitStatus(subJobs);
  const doneCount = subJobs.filter((j) => j.status === 'completed').length;
  const statusLink = `/status/${visit.property_id}`;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center space-x-2 text-sm text-gray-500">
        <Link href="/dashboard/sites" className="hover:text-gray-700">Jobs</Link>
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-gray-900">{address}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{address}</h1>
            <StatusBadge status={badgeStatus(status)} />
          </div>
          <p className="mt-1 text-sm sm:text-base text-gray-500">
            {formatVisitDate(visit.date, true)} &middot; {doneCount} of {subJobs.length} Sub Job
            {subJobs.length !== 1 ? 's' : ''} completed
          </p>
        </div>
        <button
          onClick={openDateModal}
          className="inline-flex items-center space-x-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <span>Edit date</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Sub Jobs */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Sub Jobs</h2>
            {subJobs.length === 0 ? (
              <p className="text-sm text-gray-500">No Sub Jobs on this Job.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {subJobs.map((job) => (
                  <div key={job.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <Link href={`/dashboard/sites/${job.id}`} className="min-w-0 flex-1 group">
                      <p className="text-sm font-medium text-gray-900 group-hover:text-green-700">
                        {SERVICE_TYPE_LABELS[job.service_type]}
                        {job.service_type === 'plow_lot' && job.skid_steer_used && (
                          <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-normal text-gray-600">
                            Skid steer
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {job.crew
                          ? `${job.status === 'completed' ? 'Completed' : 'Claimed'} by ${job.crew.name}`
                          : isAvailable(job)
                            ? 'Available'
                            : ' '}
                      </p>
                    </Link>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={badgeStatus(job.status)} />
                      <select
                        value={job.status}
                        disabled={updatingJobId === job.id}
                        onChange={(e) => handleStatusChange(job, e.target.value as JobStatus)}
                        className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:opacity-50"
                        aria-label={`Status for ${SERVICE_TYPE_LABELS[job.service_type]}`}
                      >
                        {(['scheduled', 'in_progress', 'completed', 'cancelled'] as JobStatus[]).map((s) => (
                          <option key={s} value={s}>{STATUS_DISPLAY[s]}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Property and client */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Property and Client</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-500">Client name</label>
                <p className="mt-1 text-gray-900">{visit.property?.client_name || '—'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500">Client email</label>
                <p className="mt-1 text-gray-900">{visit.property?.client_email || '—'}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3 text-xs">
              <a
                href={statusLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-600 hover:text-green-700 font-medium"
              >
                View client status page
              </a>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(`${window.location.origin}${statusLink}`);
                    setCopiedStatusLink(true);
                    setTimeout(() => setCopiedStatusLink(false), 2000);
                  } catch {
                    alert(`${window.location.origin}${statusLink}`);
                  }
                }}
                className="text-gray-500 hover:text-gray-700 font-medium"
              >
                {copiedStatusLink ? 'Copied!' : 'Copy link'}
              </button>
            </div>
            <p className="mt-3 text-xs text-gray-400">Client details are edited from a Sub Job&apos;s Edit button.</p>
          </div>
        </div>

        {/* Crews */}
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Crews on this Job</h2>
            <p className="mb-4 text-xs text-gray-500">
              Any crew listed here can pick up and complete any Sub Job on this Job.
            </p>

            {assignedCrews.length === 0 ? (
              <p className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
                No crew assigned yet
              </p>
            ) : (
              <ul className="space-y-2">
                {assignedCrews.map((crew) => (
                  <li key={crew.id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{crew.name}</p>
                      {crew.phone && <p className="text-xs text-gray-500">{crew.phone}</p>}
                    </div>
                    <button
                      onClick={() => handleRemoveCrew(crew)}
                      disabled={crewBusy}
                      className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {crewError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{crewError}</div>
            )}

            <div className="mt-4 flex flex-col gap-2">
              <select
                value={crewToAdd}
                onChange={(e) => setCrewToAdd(e.target.value)}
                disabled={crewBusy || addableCrews.length === 0}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:opacity-50"
                aria-label="Crew to add"
              >
                <option value="">
                  {addableCrews.length === 0 ? 'All crews are on this Job' : 'Add a crew...'}
                </option>
                {addableCrews.map((crew) => (
                  <option key={crew.id} value={crew.id}>{crew.name}</option>
                ))}
              </select>
              <button
                onClick={handleAddCrew}
                disabled={crewBusy || !crewToAdd}
                className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Edit date modal */}
      {showDateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-xl font-semibold text-gray-900">Edit date</h2>
            <p className="mt-1 text-sm text-gray-500">
              This moves the whole Job, so every Sub Job on it changes to the new date.
            </p>
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="mt-4 w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            {dateError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {dateError}
                {conflictVisitId && (
                  <>
                    {' '}
                    <Link href={`/dashboard/visits/${conflictVisitId}`} className="font-medium underline">
                      Open that Job
                    </Link>
                  </>
                )}
              </div>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowDateModal(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveDate}
                disabled={savingDate || !newDate}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {savingDate ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
