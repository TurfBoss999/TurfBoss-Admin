'use client';

import { useEffect, useState, useCallback } from 'react';
import adminApi from '@/services/adminApi';
import { JobWithCrew, Crew, JobStatus } from '@/types/database';

const STATUS_OPTIONS: { value: JobStatus; label: string }[] = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_COLORS: Record<JobStatus, string> = {
  scheduled: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  in_progress: 'bg-blue-100 text-blue-800 border-blue-200',
  completed: 'bg-green-100 text-green-800 border-green-200',
  cancelled: 'bg-gray-100 text-gray-800 border-gray-200',
};

export default function AdminJobsDashboard() {
  const [jobs, setJobs] = useState<JobWithCrew[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingJobId, setUpdatingJobId] = useState<string | null>(null);

  // Fetch jobs and crews on mount
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [jobsData, crewsData] = await Promise.all([
        adminApi.getJobs(),
        adminApi.getCrews(),
      ]);

      setJobs(jobsData);
      setCrews(crewsData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch data';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle crew assignment change
  const handleCrewChange = async (jobId: string, crewId: string | null) => {
    try {
      setUpdatingJobId(jobId);
      const updatedJob = await adminApi.updateJob(jobId, {
        crew_id: crewId || undefined,
      });
      setJobs((prev) =>
        prev.map((job) => (job.id === jobId ? updatedJob : job))
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update crew';
      setError(message);
    } finally {
      setUpdatingJobId(null);
    }
  };

  // Handle status change
  const handleStatusChange = async (jobId: string, status: JobStatus) => {
    try {
      setUpdatingJobId(jobId);
      const updatedJob = await adminApi.updateJob(jobId, { status });
      setJobs((prev) =>
        prev.map((job) => (job.id === jobId ? updatedJob : job))
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update status';
      setError(message);
    } finally {
      setUpdatingJobId(null);
    }
  };

  // Handle job deletion
  const handleDeleteJob = async (jobId: string) => {
    if (!confirm('Are you sure you want to delete this job?')) return;

    try {
      setUpdatingJobId(jobId);
      await adminApi.deleteJob(jobId);
      setJobs((prev) => prev.filter((job) => job.id !== jobId));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete job';
      setError(message);
    } finally {
      setUpdatingJobId(null);
    }
  };

  // Format date for display
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  // Format time for display
  const formatTime = (timeStr: string | null) => {
    if (!timeStr) return '-';
    return timeStr.slice(0, 5); // HH:MM
  };

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Jobs Management</h1>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center space-x-2">
            <svg
              className="h-6 w-6 animate-spin text-green-600"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="text-gray-600">Loading jobs...</span>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Jobs Management</h1>
        </div>
        <div className="rounded-lg bg-red-50 border border-red-200 p-6 text-center">
          <svg
            className="mx-auto h-12 w-12 text-red-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-red-800">Error Loading Data</h3>
          <p className="mt-2 text-red-600">{error}</p>
          <button
            onClick={fetchData}
            className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jobs Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage job assignments and status updates
          </p>
        </div>
        <button
          onClick={fetchData}
          className="inline-flex items-center space-x-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          <span>Refresh</span>
        </button>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Total Jobs</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{jobs.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Scheduled</p>
          <p className="mt-1 text-2xl font-bold text-yellow-600">
            {jobs.filter((j) => j.status === 'scheduled').length}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">In Progress</p>
          <p className="mt-1 text-2xl font-bold text-blue-600">
            {jobs.filter((j) => j.status === 'in_progress').length}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Completed</p>
          <p className="mt-1 text-2xl font-bold text-green-600">
            {jobs.filter((j) => j.status === 'completed').length}
          </p>
        </div>
      </div>

      {/* Jobs Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Date
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Address
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Service
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Time Window
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Crew
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    No jobs found
                  </td>
                </tr>
              ) : (
                jobs.map((job) => (
                  <tr
                    key={job.id}
                    className={`hover:bg-gray-50 transition-colors ${
                      updatingJobId === job.id ? 'opacity-50' : ''
                    }`}
                  >
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                      {formatDate(job.date)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="max-w-xs truncate text-sm text-gray-900">
                        {job.address}
                      </div>
                      {job.notes && (
                        <div className="max-w-xs truncate text-xs text-gray-500">
                          {job.notes}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                      {job.service_type}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      {formatTime(job.time_window_start)} - {formatTime(job.time_window_end)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <select
                        value={job.crew_id || ''}
                        onChange={(e) =>
                          handleCrewChange(job.id, e.target.value || null)
                        }
                        disabled={updatingJobId === job.id}
                        className="block w-full rounded-md border border-gray-300 py-1.5 pl-3 pr-8 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:bg-gray-100"
                      >
                        <option value="">Unassigned</option>
                        {crews.map((crew) => (
                          <option key={crew.id} value={crew.id}>
                            {crew.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <select
                        value={job.status}
                        onChange={(e) =>
                          handleStatusChange(job.id, e.target.value as JobStatus)
                        }
                        disabled={updatingJobId === job.id}
                        className={`block w-full rounded-md border py-1.5 pl-3 pr-8 text-sm focus:outline-none focus:ring-1 disabled:bg-gray-100 ${STATUS_COLORS[job.status]}`}
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right">
                      <button
                        onClick={() => handleDeleteJob(job.id)}
                        disabled={updatingJobId === job.id}
                        className="text-red-600 hover:text-red-800 disabled:opacity-50"
                      >
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
