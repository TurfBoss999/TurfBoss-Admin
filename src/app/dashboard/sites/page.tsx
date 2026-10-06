'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import { Crew, JobStatus, JobVisitWithDetails, SERVICE_TYPE_LABELS } from '@/types/database';
import StatusBadge from '@/components/StatusBadge';
import { badgeStatus, formatVisitDate, isAvailable, visitStatus } from '@/lib/jobVisits';

type StatusFilter = 'All' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

const STATUS_DISPLAY: Record<JobStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

// A Job is a property visit: one row per property per date. The services under
// it are its Sub Jobs (rows in the jobs table).
function visitAddress(visit: JobVisitWithDetails): string {
  return visit.property?.address || visit.jobs[0]?.address || 'Unknown property';
}

function crewSummary(visit: JobVisitWithDetails): string {
  const names = visit.crews
    .map((c) => c.crew)
    .filter((c): c is Crew => !!c)
    .map((c) => c.name)
    .sort((a, b) => a.localeCompare(b));
  if (names.length === 0) return 'Unassigned';
  return names.length <= 2 ? names.join(', ') : `${names.length} crews`;
}

const supabase = getSupabaseBrowserClient();

export default function JobsPage() {
  const [visits, setVisits] = useState<JobVisitWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');

  useEffect(() => {
    let cancelled = false;

    async function fetchJobs() {
      try {
        setLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from('job_visits')
          .select('*, property:properties(*), crews:job_visit_crews(crew:crews(*)), jobs(*, crew:crews(*))')
          .order('date', { ascending: true });

        if (cancelled) return;
        if (fetchError) throw fetchError;

        // A visit with no Sub Jobs (left behind by a failed create) isn't a Job anyone can act on.
        setVisits((data as JobVisitWithDetails[]).filter((v) => v.jobs.length > 0));
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to fetch jobs';
        setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchJobs();
    return () => { cancelled = true; };
  }, []);
  const filteredVisits = visits.filter((visit) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      visitAddress(visit).toLowerCase().includes(q) ||
      visit.jobs.some((job) => SERVICE_TYPE_LABELS[job.service_type].toLowerCase().includes(q));

    const matchesStatus = statusFilter === 'All' || visitStatus(visit.jobs) === statusFilter;

    return matchesSearch && matchesStatus;
  });
  const statusCounts = {
    All: visits.length,
    scheduled: visits.filter((v) => visitStatus(v.jobs) === 'scheduled').length,
    in_progress: visits.filter((v) => visitStatus(v.jobs) === 'in_progress').length,
    completed: visits.filter((v) => visitStatus(v.jobs) === 'completed').length,
    cancelled: visits.filter((v) => visitStatus(v.jobs) === 'cancelled').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center space-x-2">
          <svg className="h-6 w-6 animate-spin text-green-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-gray-600">Loading jobs...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-6 text-center">
        <p className="text-red-600">{error}</p>
        <button onClick={() => window.location.reload()} className="mt-4 text-red-700 underline">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jobs</h1>
          <p className="mt-1 text-sm text-gray-500">
            Each Job is one property visit; its services are the Sub Jobs underneath
          </p>
        </div>
        <Link
          href="/dashboard/sites/new"
          className="inline-flex items-center space-x-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          <span>Add Job</span>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            placeholder="Search jobs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
          <svg className="absolute left-3 top-3 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1">
          {(['All', 'scheduled', 'in_progress', 'completed'] as StatusFilter[]).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                statusFilter === status
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {status === 'All' ? 'All' : STATUS_DISPLAY[status]}
              <span className={`ml-1.5 inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs ${
                statusFilter === status ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
              }`}>
                {statusCounts[status]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Jobs - Desktop */}
      <div className="hidden md:block overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Property</th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Date</th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Crew</th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Sub Jobs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filteredVisits.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                    No jobs found
                  </td>
                </tr>
              ) : (
                filteredVisits.map((visit) => (
                  <tr key={visit.id} className="hover:bg-gray-50 transition-colors align-top">
                    <td className="px-6 py-4">
                      <Link href={`/dashboard/visits/${visit.id}`} className="group flex items-center">
                        <div className="h-10 w-10 flex-shrink-0">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 text-green-600">
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </div>
                        </div>
                        <div className="ml-4">
                          <p className="text-sm font-medium text-gray-900 group-hover:text-green-700">{visitAddress(visit)}</p>
                          <p className="text-xs text-gray-400">
                            {visit.jobs.length} Sub Job{visit.jobs.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{formatVisitDate(visit.date)}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{crewSummary(visit)}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1.5">
                        {visit.jobs.map((job) => (
                          <Link
                            key={job.id}
                            href={`/dashboard/sites/${job.id}`}
                            className="flex items-center justify-between gap-3 rounded-lg px-2 py-1 hover:bg-gray-100 transition-colors"
                          >
                            <span className="text-sm text-gray-700">
                              {SERVICE_TYPE_LABELS[job.service_type]}
                              {isAvailable(job) && <span className="ml-2 text-xs text-gray-400">Available</span>}
                            </span>
                            <StatusBadge status={badgeStatus(job.status)} />
                          </Link>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Jobs - Mobile */}
      <div className="space-y-3 md:hidden">
        {filteredVisits.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center text-gray-500 shadow-sm">
            No jobs found
          </div>
        ) : (
          filteredVisits.map((visit) => (
            <div key={visit.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <Link href={`/dashboard/visits/${visit.id}`} className="flex items-start space-x-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-600">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{visitAddress(visit)}</p>
                  <div className="mt-0.5 flex items-center justify-between text-xs text-gray-500">
                    <span>{formatVisitDate(visit.date)}</span>
                    <span>{crewSummary(visit)}</span>
                  </div>
                </div>
              </Link>
              <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-3">
                {visit.jobs.map((job) => (
                  <Link
                    key={job.id}
                    href={`/dashboard/sites/${job.id}`}
                    className="flex items-center justify-between rounded-lg px-2 py-1 hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-sm text-gray-700">
                      {SERVICE_TYPE_LABELS[job.service_type]}
                      {isAvailable(job) && <span className="ml-2 text-xs text-gray-400">Available</span>}
                    </span>
                    <StatusBadge status={badgeStatus(job.status)} />
                  </Link>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Results Info */}
      <div className="text-sm text-gray-500">
        Showing {filteredVisits.length} of {visits.length} Job{visits.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
