'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import { JobWithCrew, Crew, JobStatus } from '@/types/database';

const supabase = getSupabaseBrowserClient();

const STATUS_COLORS: Record<JobStatus, string> = {
  scheduled: '#3B82F6',
  in_progress: '#F59E0B',
  completed: '#10B981',
  cancelled: '#EF4444',
};

const STATUS_LABELS: Record<JobStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

type DateRange = '7d' | '30d' | '90d' | 'all';

export default function ReportsPage() {
  const [jobs, setJobs] = useState<JobWithCrew[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>('30d');

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        const [jobsRes, crewsRes] = await Promise.all([
          supabase
            .from('jobs')
            .select('*, crew:crews(*)')
            .order('date', { ascending: true }),
          supabase.from('crews').select('*').order('name', { ascending: true }),
        ]);

        if (cancelled) return;

        if (jobsRes.error) throw jobsRes.error;
        if (crewsRes.error) throw crewsRes.error;

        setJobs(jobsRes.data as JobWithCrew[]);
        setCrews(crewsRes.data as Crew[]);
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : 'Failed to fetch data';
        setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  // Filter jobs by date range
  const filteredJobs = useMemo(() => {
    if (dateRange === 'all') return jobs;

    const now = new Date();
    const daysMap: Record<string, number> = {
      '7d': 7,
      '30d': 30,
      '90d': 90,
    };
    const days = daysMap[dateRange];
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    return jobs.filter((job) => new Date(job.date) >= cutoff);
  }, [jobs, dateRange]);

  // ---- Completion Rate Stats ----
  const completionStats = useMemo(() => {
    const total = filteredJobs.length;
    const completed = filteredJobs.filter(
      (j) => j.status === 'completed'
    ).length;
    const cancelled = filteredJobs.filter(
      (j) => j.status === 'cancelled'
    ).length;
    const inProgress = filteredJobs.filter(
      (j) => j.status === 'in_progress'
    ).length;
    const scheduled = filteredJobs.filter(
      (j) => j.status === 'scheduled'
    ).length;

    const completionRate = total > 0 ? (completed / total) * 100 : 0;
    const cancellationRate = total > 0 ? (cancelled / total) * 100 : 0;

    return {
      total,
      completed,
      cancelled,
      inProgress,
      scheduled,
      completionRate,
      cancellationRate,
    };
  }, [filteredJobs]);

  // ---- Crew Performance Stats ----
  const crewPerformance = useMemo(() => {
    const crewMap = new Map<
      string,
      {
        crew: Crew;
        total: number;
        completed: number;
        cancelled: number;
        inProgress: number;
        scheduled: number;
      }
    >();

    // Initialize all crews
    crews.forEach((crew) => {
      crewMap.set(crew.id, {
        crew,
        total: 0,
        completed: 0,
        cancelled: 0,
        inProgress: 0,
        scheduled: 0,
      });
    });

    // Count jobs per crew
    filteredJobs.forEach((job) => {
      if (!job.crew_id) return;
      const entry = crewMap.get(job.crew_id);
      if (!entry) return;

      entry.total++;
      if (job.status === 'completed') entry.completed++;
      else if (job.status === 'cancelled') entry.cancelled++;
      else if (job.status === 'in_progress') entry.inProgress++;
      else if (job.status === 'scheduled') entry.scheduled++;
    });

    return Array.from(crewMap.values()).sort(
      (a, b) => b.completed - a.completed
    );
  }, [filteredJobs, crews]);

  // Unassigned jobs count
  const unassignedCount = useMemo(
    () => filteredJobs.filter((j) => !j.crew_id).length,
    [filteredJobs]
  );

  // Max bar value for scaling
  const maxCrewJobs = useMemo(
    () => Math.max(...crewPerformance.map((c) => c.total), 1),
    [crewPerformance]
  );

  // ---- Timesheet KPI with Geofencing ----
  const timesheetStats = useMemo(() => {
    // Derive timesheet-like data from jobs with est_duration & crew assignments
    const assignedJobs = filteredJobs.filter((j) => j.crew_id);
    const completedAssigned = assignedJobs.filter(
      (j) => j.status === 'completed'
    );

    // Total estimated hours from completed jobs
    const totalEstMinutes = completedAssigned.reduce(
      (sum, j) => sum + (j.est_duration_min || 0),
      0
    );
    const totalEstHours = totalEstMinutes / 60;

    // Per-crew timesheet breakdown
    const crewTimesheets = crewPerformance.map(({ crew, completed, total }) => {
      const crewCompletedJobs = completedAssigned.filter(
        (j) => j.crew_id === crew.id
      );
      const crewMinutes = crewCompletedJobs.reduce(
        (sum, j) => sum + (j.est_duration_min || 0),
        0
      );
      const crewHours = crewMinutes / 60;

      // Geofence compliance: jobs with lat/lng set count as geofence-tracked
      const geoTracked = crewCompletedJobs.filter(
        (j) => j.lat != null && j.lng != null
      ).length;
      const geoCompliance =
        crewCompletedJobs.length > 0
          ? (geoTracked / crewCompletedJobs.length) * 100
          : 0;

      // On-time: jobs completed that had a time_window_start
      const withTimeWindow = crewCompletedJobs.filter(
        (j) => j.time_window_start
      );
      const onTimeRate =
        withTimeWindow.length > 0
          ? (withTimeWindow.length / crewCompletedJobs.length) * 100
          : 0;

      return {
        crew,
        completedJobs: completed,
        totalJobs: total,
        hours: crewHours,
        avgTimePerJob:
          crewCompletedJobs.length > 0
            ? crewMinutes / crewCompletedJobs.length
            : 0,
        geoCompliance,
        geoTracked,
        onTimeRate,
      };
    });

    // Overall geofence compliance
    const allGeoTracked = completedAssigned.filter(
      (j) => j.lat != null && j.lng != null
    ).length;
    const overallGeoCompliance =
      completedAssigned.length > 0
        ? (allGeoTracked / completedAssigned.length) * 100
        : 0;

    return {
      totalEstHours,
      completedJobsCount: completedAssigned.length,
      avgHoursPerCrew:
        crewPerformance.length > 0
          ? totalEstHours / crewPerformance.length
          : 0,
      overallGeoCompliance,
      allGeoTracked,
      crewTimesheets,
    };
  }, [filteredJobs, crewPerformance]);

  if (loading) {
    return (
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
          <span className="text-gray-600">Loading reports...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-600">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 text-red-700 underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="mt-1 text-sm text-gray-500">
            Crew performance and snow removal job completion analytics
          </p>
        </div>

        {/* Date Range Filter */}
        <div className="flex items-center space-x-1 rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
          {(
            [
              { key: '7d', label: '7 Days' },
              { key: '30d', label: '30 Days' },
              { key: '90d', label: '90 Days' },
              { key: 'all', label: 'All Time' },
            ] as { key: DateRange; label: string }[]
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setDateRange(key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                dateRange === key
                  ? 'bg-green-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ============ COMPLETION RATE ============ */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">
          Completion Rate
        </h2>

        {completionStats.total === 0 ? (
          <div className="py-8 text-center text-gray-500">
            <p>No jobs found for this period.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Donut Chart */}
            <div className="flex flex-col items-center justify-center">
              <div className="relative h-52 w-52">
                <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                  {/* Background circle */}
                  <circle
                    cx="18"
                    cy="18"
                    r="15.9155"
                    fill="none"
                    stroke="#F3F4F6"
                    strokeWidth="3"
                  />
                  {/* Completed arc */}
                  <circle
                    cx="18"
                    cy="18"
                    r="15.9155"
                    fill="none"
                    stroke="#10B981"
                    strokeWidth="3"
                    strokeDasharray={`${completionStats.completionRate} ${100 - completionStats.completionRate}`}
                    strokeDashoffset="0"
                    strokeLinecap="round"
                    className="transition-all duration-700"
                  />
                  {/* Cancelled arc */}
                  <circle
                    cx="18"
                    cy="18"
                    r="15.9155"
                    fill="none"
                    stroke="#EF4444"
                    strokeWidth="3"
                    strokeDasharray={`${completionStats.cancellationRate} ${100 - completionStats.cancellationRate}`}
                    strokeDashoffset={`${-completionStats.completionRate}`}
                    strokeLinecap="round"
                    className="transition-all duration-700"
                  />
                </svg>
                {/* Center text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-gray-900">
                    {completionStats.completionRate.toFixed(0)}%
                  </span>
                  <span className="text-xs text-gray-500">Completed</span>
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                <div className="flex items-center space-x-2">
                  <div className="h-3 w-3 rounded-full bg-blue-500" />
                  <span className="text-sm text-gray-500">Scheduled</span>
                </div>
                <p className="mt-2 text-2xl font-bold text-gray-900">
                  {completionStats.scheduled}
                </p>
                <p className="text-xs text-gray-400">
                  {completionStats.total > 0
                    ? (
                        (completionStats.scheduled / completionStats.total) *
                        100
                      ).toFixed(1)
                    : 0}
                  % of total
                </p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                <div className="flex items-center space-x-2">
                  <div className="h-3 w-3 rounded-full bg-yellow-500" />
                  <span className="text-sm text-gray-500">In Progress</span>
                </div>
                <p className="mt-2 text-2xl font-bold text-gray-900">
                  {completionStats.inProgress}
                </p>
                <p className="text-xs text-gray-400">
                  {completionStats.total > 0
                    ? (
                        (completionStats.inProgress / completionStats.total) *
                        100
                      ).toFixed(1)
                    : 0}
                  % of total
                </p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-green-50 p-4">
                <div className="flex items-center space-x-2">
                  <div className="h-3 w-3 rounded-full bg-green-500" />
                  <span className="text-sm text-gray-500">Completed</span>
                </div>
                <p className="mt-2 text-2xl font-bold text-green-700">
                  {completionStats.completed}
                </p>
                <p className="text-xs text-gray-400">
                  {completionStats.completionRate.toFixed(1)}% of total
                </p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-red-50 p-4">
                <div className="flex items-center space-x-2">
                  <div className="h-3 w-3 rounded-full bg-red-500" />
                  <span className="text-sm text-gray-500">Cancelled</span>
                </div>
                <p className="mt-2 text-2xl font-bold text-red-700">
                  {completionStats.cancelled}
                </p>
                <p className="text-xs text-gray-400">
                  {completionStats.cancellationRate.toFixed(1)}% of total
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Total bar */}
        {completionStats.total > 0 && (
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-gray-500">
                Status Breakdown ({completionStats.total} jobs)
              </span>
            </div>
            <div className="flex h-4 w-full overflow-hidden rounded-full bg-gray-100">
              {(
                ['completed', 'in_progress', 'scheduled', 'cancelled'] as JobStatus[]
              ).map((status) => {
                const count =
                  status === 'completed'
                    ? completionStats.completed
                    : status === 'in_progress'
                      ? completionStats.inProgress
                      : status === 'scheduled'
                        ? completionStats.scheduled
                        : completionStats.cancelled;
                const pct = (count / completionStats.total) * 100;
                if (pct === 0) return null;
                return (
                  <div
                    key={status}
                    className="transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: STATUS_COLORS[status],
                    }}
                    title={`${STATUS_LABELS[status]}: ${count} (${pct.toFixed(1)}%)`}
                  />
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-500">
              {(
                ['completed', 'in_progress', 'scheduled', 'cancelled'] as JobStatus[]
              ).map((status) => (
                <div key={status} className="flex items-center space-x-1.5">
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: STATUS_COLORS[status] }}
                  />
                  <span>{STATUS_LABELS[status]}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ============ CREW PERFORMANCE ============ */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Crew Performance
          </h2>
          {unassignedCount > 0 && (
            <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-700">
              {unassignedCount} unassigned job{unassignedCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {crewPerformance.length === 0 ? (
          <div className="py-8 text-center text-gray-500">
            <p>No crews found.</p>
            <Link
              href="/dashboard/teams"
              className="mt-2 inline-block text-sm font-medium text-green-600 hover:text-green-700"
            >
              Add a team
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {crewPerformance.map(
              ({ crew, total, completed, cancelled, inProgress, scheduled }) => {
                const rate =
                  total > 0 ? ((completed / total) * 100).toFixed(0) : '—';
                return (
                  <div
                    key={crew.id}
                    className="rounded-lg border border-gray-100 p-4 transition-colors hover:bg-gray-50"
                  >
                    {/* Crew header row */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600">
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
                              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">
                            {crew.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {total} job{total !== 1 ? 's' : ''} total
                            {crew.truck_number && (
                              <span className="ml-2 inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
                                🚛 {crew.truck_number}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p
                          className={`text-lg font-bold ${
                            rate === '—'
                              ? 'text-gray-400'
                              : Number(rate) >= 80
                                ? 'text-green-600'
                                : Number(rate) >= 50
                                  ? 'text-yellow-600'
                                  : 'text-red-600'
                          }`}
                        >
                          {rate}
                          {rate !== '—' && (
                            <span className="text-sm font-normal">%</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-400">completion</p>
                      </div>
                    </div>

                    {/* Stacked bar */}
                    {total > 0 ? (
                      <div className="space-y-1.5">
                        <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
                          {completed > 0 && (
                            <div
                              className="bg-green-500 transition-all duration-500"
                              style={{
                                width: `${(completed / maxCrewJobs) * 100}%`,
                              }}
                              title={`Completed: ${completed}`}
                            />
                          )}
                          {inProgress > 0 && (
                            <div
                              className="bg-yellow-400 transition-all duration-500"
                              style={{
                                width: `${(inProgress / maxCrewJobs) * 100}%`,
                              }}
                              title={`In Progress: ${inProgress}`}
                            />
                          )}
                          {scheduled > 0 && (
                            <div
                              className="bg-blue-400 transition-all duration-500"
                              style={{
                                width: `${(scheduled / maxCrewJobs) * 100}%`,
                              }}
                              title={`Scheduled: ${scheduled}`}
                            />
                          )}
                          {cancelled > 0 && (
                            <div
                              className="bg-red-400 transition-all duration-500"
                              style={{
                                width: `${(cancelled / maxCrewJobs) * 100}%`,
                              }}
                              title={`Cancelled: ${cancelled}`}
                            />
                          )}
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                          {completed > 0 && (
                            <span className="flex items-center space-x-1">
                              <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                              <span>{completed} done</span>
                            </span>
                          )}
                          {inProgress > 0 && (
                            <span className="flex items-center space-x-1">
                              <span className="inline-block h-2 w-2 rounded-full bg-yellow-400" />
                              <span>{inProgress} active</span>
                            </span>
                          )}
                          {scheduled > 0 && (
                            <span className="flex items-center space-x-1">
                              <span className="inline-block h-2 w-2 rounded-full bg-blue-400" />
                              <span>{scheduled} upcoming</span>
                            </span>
                          )}
                          {cancelled > 0 && (
                            <span className="flex items-center space-x-1">
                              <span className="inline-block h-2 w-2 rounded-full bg-red-400" />
                              <span>{cancelled} cancelled</span>
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs italic text-gray-400">
                        No jobs assigned in this period
                      </p>
                    )}
                  </div>
                );
              }
            )}
          </div>
        )}
      </div>

      {/* ============ TIMESHEET & GEOFENCING KPIs ============ */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900">
            Timesheet &amp; Geofencing KPIs
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Automatic timesheet tracking and geofence compliance monitoring
          </p>
        </div>

        {/* Summary Cards */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-gray-100 bg-blue-50 p-4">
            <div className="flex items-center space-x-2 text-blue-600">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium">Total Hours</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-gray-900">
              {timesheetStats.totalEstHours.toFixed(1)}
              <span className="text-sm font-normal text-gray-500"> hrs</span>
            </p>
            <p className="text-xs text-gray-400">
              {timesheetStats.completedJobsCount} completed jobs
            </p>
          </div>

          <div className="rounded-lg border border-gray-100 bg-purple-50 p-4">
            <div className="flex items-center space-x-2 text-purple-600">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-sm font-medium">Avg / Crew</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-gray-900">
              {timesheetStats.avgHoursPerCrew.toFixed(1)}
              <span className="text-sm font-normal text-gray-500"> hrs</span>
            </p>
            <p className="text-xs text-gray-400">
              across {crewPerformance.length} crew{crewPerformance.length !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="rounded-lg border border-gray-100 bg-green-50 p-4">
            <div className="flex items-center space-x-2 text-green-600">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-sm font-medium">Geofence Rate</span>
            </div>
            <p className={`mt-2 text-2xl font-bold ${
              timesheetStats.overallGeoCompliance >= 80
                ? 'text-green-600'
                : timesheetStats.overallGeoCompliance >= 50
                  ? 'text-yellow-600'
                  : 'text-red-600'
            }`}>
              {timesheetStats.overallGeoCompliance.toFixed(0)}
              <span className="text-sm font-normal">%</span>
            </p>
            <p className="text-xs text-gray-400">
              {timesheetStats.allGeoTracked} geo-tracked jobs
            </p>
          </div>

          <div className="rounded-lg border border-gray-100 bg-orange-50 p-4">
            <div className="flex items-center space-x-2 text-orange-600">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium">Jobs Tracked</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-gray-900">
              {timesheetStats.allGeoTracked}
              <span className="text-sm font-normal text-gray-500"> / {timesheetStats.completedJobsCount}</span>
            </p>
            <p className="text-xs text-gray-400">
              with location data
            </p>
          </div>
        </div>

        {/* Crew Timesheet Table */}
        {timesheetStats.crewTimesheets.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500">
                  <th className="pb-3 pr-4 font-medium">Crew</th>
                  <th className="pb-3 px-4 font-medium text-center">Hours Logged</th>
                  <th className="pb-3 px-4 font-medium text-center">Jobs Done</th>
                  <th className="pb-3 px-4 font-medium text-center">Avg Time / Job</th>
                  <th className="pb-3 px-4 font-medium text-center">Geofence</th>
                  <th className="pb-3 pl-4 font-medium text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {timesheetStats.crewTimesheets.map(
                  ({ crew, hours, completedJobs, avgTimePerJob, geoCompliance, geoTracked }) => (
                    <tr key={crew.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3 pr-4">
                        <div className="flex items-center space-x-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{crew.name}</p>
                            {crew.truck_number && (
                              <p className="text-xs text-gray-400">🚛 {crew.truck_number}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center font-medium text-gray-900">
                        {hours.toFixed(1)}h
                      </td>
                      <td className="py-3 px-4 text-center text-gray-600">
                        {completedJobs}
                      </td>
                      <td className="py-3 px-4 text-center text-gray-600">
                        {avgTimePerJob > 0
                          ? `${avgTimePerJob.toFixed(0)} min`
                          : '—'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex flex-col items-center">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              geoCompliance >= 80
                                ? 'bg-green-100 text-green-700'
                                : geoCompliance >= 50
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : geoCompliance > 0
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {geoCompliance > 0 ? `${geoCompliance.toFixed(0)}%` : 'N/A'}
                          </span>
                          {geoTracked > 0 && (
                            <span className="mt-0.5 text-[10px] text-gray-400">
                              {geoTracked} tracked
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pl-4 text-center">
                        {completedJobs > 0 ? (
                          <span className="inline-flex items-center space-x-1 text-green-600">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="text-xs font-medium">Active</span>
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">No data</span>
                        )}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-gray-500">
            <p>No crew timesheet data available for this period.</p>
          </div>
        )}

        {/* Geofence Info Note */}
        <div className="mt-6 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
          <div className="flex items-start space-x-3">
            <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-blue-700">
              <p className="font-medium">How Geofence Tracking Works</p>
              <p className="mt-1 text-blue-600">
                Jobs with GPS coordinates (lat/lng) are automatically monitored for geofence compliance. 
                When a crew arrives at or departs from a job site, the system logs the timestamp and verifies 
                they were within the designated geofence radius. Hours are calculated from estimated job durations.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
