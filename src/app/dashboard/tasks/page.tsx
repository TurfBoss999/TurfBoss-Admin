'use client';

import { useState, useEffect } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import { JobWithCrew, JobStatus } from '@/types/database';
import StatusBadge from '@/components/StatusBadge';
import Link from 'next/link';

const STATUS_DISPLAY: Record<JobStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const supabase = getSupabaseBrowserClient();

export default function TasksPage() {
  const [jobs, setJobs] = useState<JobWithCrew[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchJobs() {
      try {
        setLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from('jobs')
          .select('*, crew:crews(*)')
          .order('date', { ascending: true });

        if (cancelled) return;
        if (fetchError) throw fetchError;

        setJobs(data as JobWithCrew[]);
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
        <button onClick={fetchJobs} className="mt-4 text-red-700 underline">
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
          <h1 className="text-2xl font-bold text-gray-900">Jobs Schedule</h1>
          <p className="mt-1 text-sm text-gray-500">
            View and manage all scheduled jobs
          </p>
        </div>
        <button className="inline-flex items-center space-x-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          <span>Create Job</span>
        </button>
      </div>

      {/* Jobs List */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">All Jobs ({jobs.length})</h2>
        </div>
        <div className="divide-y divide-gray-200">
          {jobs.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-500">No jobs found</div>
          ) : (
            jobs.map((job) => (
              <Link
                key={job.id}
                href={`/dashboard/sites/${job.id}`}
                className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center space-x-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{job.service_type}</p>
                    <p className="text-sm text-gray-500">{job.address}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(job.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {job.crew && ` • ${job.crew.name}`}
                    </p>
                  </div>
                </div>
                <StatusBadge status={job.status === 'in_progress' ? 'In Progress' : job.status === 'scheduled' ? 'Pending' : 'Completed'} />
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
