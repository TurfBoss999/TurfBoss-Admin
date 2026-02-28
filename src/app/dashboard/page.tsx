'use client';

import { useState, useEffect } from 'react';
import { StatCard } from '@/components';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import { JobWithCrew, Crew } from '@/types/database';
import StatusBadge from '@/components/StatusBadge';
import Link from 'next/link';

const supabase = getSupabaseBrowserClient();

export default function DashboardPage() {
  const [jobs, setJobs] = useState<JobWithCrew[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        const [jobsRes, crewsRes] = await Promise.all([
          supabase.from('jobs').select('*, crew:crews(*)').order('date', { ascending: true }),
          supabase.from('crews').select('*'),
        ]);

        if (cancelled) return;
        if (jobsRes.error) throw jobsRes.error;
        if (crewsRes.error) throw crewsRes.error;

        setJobs(jobsRes.data as JobWithCrew[]);
        setCrews(crewsRes.data as Crew[]);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to fetch data';
        setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, []);

  const recentJobs = jobs.slice(0, 4);
  const scheduledJobs = jobs.filter((j) => j.status === 'scheduled' || j.status === 'in_progress');

  const stats = {
    totalJobs: jobs.length,
    activeJobs: jobs.filter((j) => j.status === 'in_progress').length,
    scheduledJobs: jobs.filter((j) => j.status === 'scheduled').length,
    totalCrews: crews.length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center space-x-2">
          <svg className="h-6 w-6 animate-spin text-green-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-gray-600">Loading dashboard...</span>
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Welcome back! Here&apos;s an overview of your jobs and crews.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Jobs"
          value={stats.totalJobs}
          color="green"
          icon={
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
        />
        <StatCard
          title="In Progress"
          value={stats.activeJobs}
          color="blue"
          icon={
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
        />
        <StatCard
          title="Scheduled"
          value={stats.scheduledJobs}
          color="yellow"
          icon={
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          }
        />
        <StatCard
          title="Total Crews"
          value={stats.totalCrews}
          color="purple"
          icon={
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          }
        />
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Jobs */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent Jobs</h2>
            <Link href="/dashboard/sites" className="text-sm text-green-600 hover:text-green-700">
              View all
            </Link>
          </div>
          <div className="space-y-4">
            {recentJobs.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-4">No jobs found</p>
            ) : (
              recentJobs.map((job) => (
                <Link
                  key={job.id}
                  href={`/dashboard/sites/${job.id}`}
                  className="flex items-center justify-between rounded-lg p-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 text-green-600">
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{job.service_type}</p>
                      <p className="text-xs text-gray-500 truncate max-w-[150px] sm:max-w-[200px]">{job.address}</p>
                    </div>
                  </div>
                  <StatusBadge status={job.status === 'in_progress' ? 'In Progress' : job.status === 'scheduled' ? 'Pending' : 'Completed'} />
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Scheduled Jobs */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Upcoming Jobs</h2>
            <Link href="/dashboard/tasks" className="text-sm text-green-600 hover:text-green-700">
              View all
            </Link>
          </div>
          <div className="space-y-4">
            {scheduledJobs.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-4">No scheduled jobs</p>
            ) : (
              scheduledJobs.slice(0, 5).map((job) => (
                <Link
                  key={job.id}
                  href={`/dashboard/sites/${job.id}`}
                  className="flex items-center justify-between rounded-lg p-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{job.service_type}</p>
                      <p className="text-xs text-gray-500">{job.crew?.name || 'Unassigned'}</p>
                    </div>
                  </div>
                  <StatusBadge status={job.status === 'in_progress' ? 'In Progress' : job.status === 'scheduled' ? 'Pending' : 'Completed'} />
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Link
            href="/dashboard/sites/new"
            className="flex flex-col items-center justify-center rounded-lg border border-gray-200 p-4 hover:border-green-500 hover:bg-green-50 transition-colors"
          >
            <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <span className="mt-2 text-sm font-medium text-gray-700">Add Job</span>
          </Link>
          <Link
            href="/dashboard/teams"
            className="flex flex-col items-center justify-center rounded-lg border border-gray-200 p-4 hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <svg className="h-8 w-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <span className="mt-2 text-sm font-medium text-gray-700">Add Crew</span>
          </Link>
          <Link
            href="/dashboard/reports"
            className="flex flex-col items-center justify-center rounded-lg border border-gray-200 p-4 hover:border-purple-500 hover:bg-purple-50 transition-colors"
          >
            <svg
              className="h-8 w-8 text-purple-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <span className="mt-2 text-sm font-medium text-gray-700">View Reports</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
