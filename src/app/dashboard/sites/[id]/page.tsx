'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import { JobWithCrew, JobStatus, Crew } from '@/types/database';
import StatusBadge from '@/components/StatusBadge';

const STATUS_DISPLAY: Record<JobStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const supabase = getSupabaseBrowserClient();

export default function JobDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  const [job, setJob] = useState<JobWithCrew | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Crew assignment state
  const [crews, setCrews] = useState<Crew[]>([]);
  const [showCrewPicker, setShowCrewPicker] = useState(false);
  const [assigningCrew, setAssigningCrew] = useState(false);

  // Status update state
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    service_type: '',
    address: '',
    date: '',
    notes: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);

  function openEditModal() {
    if (!job) return;
    setEditForm({
      service_type: job.service_type || '',
      address: job.address || '',
      date: job.date || '',
      notes: job.notes || '',
    });
    setShowEditModal(true);
  }

  async function handleSaveEdit() {
    if (!job) return;
    try {
      setSavingEdit(true);

      const { data, error: updateError } = await supabase
        .from('jobs')
        .update({
          service_type: editForm.service_type,
          address: editForm.address,
          date: editForm.date,
          notes: editForm.notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*, crew:crews(*)')
        .single();

      if (updateError) throw updateError;
      setJob(data as JobWithCrew);
      setShowEditModal(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update job';
      alert(message);
    } finally {
      setSavingEdit(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function fetchJob() {
      try {
        setLoading(true);
        setError(null);

        const [jobResult, crewsResult] = await Promise.all([
          supabase
            .from('jobs')
            .select('*, crew:crews(*)')
            .eq('id', id)
            .single(),
          supabase
            .from('crews')
            .select('*')
            .order('name', { ascending: true }),
        ]);

        if (cancelled) return;

        if (crewsResult.data) {
          setCrews(crewsResult.data as Crew[]);
        }

        if (jobResult.error) {
          if (jobResult.error.code === 'PGRST116') {
            setJob(null);
          } else {
            throw jobResult.error;
          }
        } else {
          setJob(jobResult.data as JobWithCrew);
        }
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to fetch job';
        setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchJob();
    return () => { cancelled = true; };
  }, [id]);

  async function handleAssignCrew(crewId: string | null) {
    try {
      setAssigningCrew(true);

      const { data, error: updateError } = await supabase
        .from('jobs')
        .update({ crew_id: crewId, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*, crew:crews(*)')
        .single();

      if (updateError) throw updateError;
      setJob(data as JobWithCrew);
      setShowCrewPicker(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to assign crew';
      alert(message);
    } finally {
      setAssigningCrew(false);
    }
  }

  async function handleStatusUpdate(newStatus: JobStatus) {
    if (!job || job.status === newStatus) return;
    try {
      setUpdatingStatus(true);

      const { data, error: updateError } = await supabase
        .from('jobs')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*, crew:crews(*)')
        .single();

      if (updateError) throw updateError;
      setJob(data as JobWithCrew);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update status';
      alert(message);
    } finally {
      setUpdatingStatus(false);
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
          <span className="text-gray-600">Loading job details...</span>
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

  if (!job) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <svg className="h-16 w-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h2 className="mt-4 text-xl font-semibold text-gray-900">Job not found</h2>
        <p className="mt-2 text-gray-500">The job you&apos;re looking for doesn&apos;t exist.</p>
        <Link href="/dashboard/sites" className="mt-4 text-green-600 hover:text-green-700">
          &larr; Back to Jobs
        </Link>
      </div>
    );
  }

  const statusDisplay = job.status === 'in_progress' ? 'In Progress' : job.status === 'scheduled' ? 'Pending' : 'Completed';

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center space-x-2 text-sm text-gray-500">
        <Link href="/dashboard" className="hover:text-gray-700">Dashboard</Link>
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <Link href="/dashboard/sites" className="hover:text-gray-700">Jobs</Link>
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-gray-900">{job.service_type}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start space-x-4">
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-green-100 text-green-600">
            <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{job.service_type}</h1>
              <StatusBadge status={statusDisplay} />
            </div>
            <p className="mt-1 text-sm sm:text-base text-gray-500">{job.address}</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={openEditModal}
            className="inline-flex items-center space-x-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <span>Edit Job</span>
          </button>
          <button
            onClick={() => router.back()}
            className="inline-flex items-center space-x-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back</span>
          </button>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column - Job Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Job Information Card */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Job Information</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-500">Service Type</label>
                <p className="mt-1 text-gray-900">{job.service_type}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500">Status</label>
                <div className="mt-1">
                  <StatusBadge status={statusDisplay} />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-500">Address</label>
                <p className="mt-1 text-gray-900">{job.address}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500">Date</label>
                <p className="mt-1 text-gray-900">
                  {new Date(job.date).toLocaleDateString('en-US', { 
                    weekday: 'long',
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500">Created</label>
                <p className="mt-1 text-gray-900">
                  {new Date(job.created_at).toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </p>
              </div>
            </div>
          </div>

          {/* Notes Card */}
          {job.notes && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Notes</h2>
              <p className="text-gray-700 whitespace-pre-wrap">{job.notes}</p>
            </div>
          )}

          {/* Images Card */}
          {job.image_urls && job.image_urls.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Photos ({job.image_urls.length})
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {job.image_urls.map((url, index) => (
                  <a
                    key={index}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200"
                  >
                    <img
                      src={url}
                      alt={`Job photo ${index + 1}`}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
                    <div className="absolute bottom-2 right-2 rounded-full bg-white/80 p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <svg className="h-4 w-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Crew Info */}
        <div className="space-y-6">
          {/* Crew Card */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Assigned Crew</h2>
            </div>
            {job.crew ? (
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                <div className="flex items-center space-x-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-600">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{job.crew.name}</p>
                    {job.crew.phone && (
                      <p className="text-xs text-gray-500">{job.crew.phone}</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-gray-500">
                <svg className="mx-auto h-8 w-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <p className="mt-2 text-sm">No crew assigned</p>
              </div>
            )}
            <button
              onClick={() => setShowCrewPicker(!showCrewPicker)}
              className="mt-4 w-full inline-flex items-center justify-center space-x-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span>{job.crew ? 'Reassign Crew' : 'Assign Crew'}</span>
            </button>

            {/* Crew Picker Dropdown */}
            {showCrewPicker && (
              <div className="mt-3 rounded-lg border border-gray-200 bg-white shadow-lg">
                <div className="border-b border-gray-100 px-4 py-2">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Select a Crew</p>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {/* Unassign option */}
                  {job.crew && (
                    <button
                      onClick={() => handleAssignCrew(null)}
                      disabled={assigningCrew}
                      className="w-full flex items-center space-x-3 px-4 py-3 text-left text-sm hover:bg-red-50 text-red-600 border-b border-gray-100 disabled:opacity-50"
                    >
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      <span>Unassign Crew</span>
                    </button>
                  )}

                  {crews.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-gray-500">
                      <p>No crews available.</p>
                      <Link href="/dashboard/teams" className="mt-1 text-green-600 hover:text-green-700 font-medium">
                        Add a team first
                      </Link>
                    </div>
                  ) : (
                    crews.map((crew) => {
                      const isSelected = job.crew_id === crew.id;
                      return (
                        <button
                          key={crew.id}
                          onClick={() => handleAssignCrew(crew.id)}
                          disabled={assigningCrew || isSelected}
                          className={`w-full flex items-center justify-between px-4 py-3 text-left text-sm transition-colors disabled:opacity-50 ${
                            isSelected
                              ? 'bg-green-50 text-green-800'
                              : 'hover:bg-gray-50 text-gray-700'
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
                              isSelected ? 'bg-green-200 text-green-700' : 'bg-blue-100 text-blue-600'
                            }`}>
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                            </div>
                            <div>
                              <p className="font-medium">{crew.name}</p>
                              {crew.phone && <p className="text-xs text-gray-500">{crew.phone}</p>}
                            </div>
                          </div>
                          {isSelected && (
                            <svg className="h-5 w-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>

                {assigningCrew && (
                  <div className="flex items-center justify-center border-t border-gray-100 px-4 py-2">
                    <svg className="h-4 w-4 animate-spin text-green-600 mr-2" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span className="text-xs text-gray-500">Updating...</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Status Card */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Job Status</h2>
            <div className="flex flex-col space-y-2">
              {(['scheduled', 'in_progress', 'completed', 'cancelled'] as JobStatus[]).map((status) => (
                <button
                  key={status}
                  onClick={() => handleStatusUpdate(status)}
                  disabled={updatingStatus || job.status === status}
                  className={`w-full text-left px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:cursor-default ${
                    job.status === status
                      ? 'bg-green-100 text-green-800 border-2 border-green-500'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200 disabled:opacity-50'
                  }`}
                >
                  <span className="flex items-center justify-between">
                    {STATUS_DISPLAY[status]}
                    {job.status === status && (
                      <svg className="h-4 w-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Job Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg mx-4 rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Edit Job</h2>
              <button
                onClick={() => setShowEditModal(false)}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Service Type</label>
                <input
                  type="text"
                  value={editForm.service_type}
                  onChange={(e) => setEditForm({ ...editForm, service_type: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  placeholder="e.g., Snow Removal"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <input
                  type="text"
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  placeholder="123 Main St, City, State"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  value={editForm.date}
                  onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  placeholder="Additional notes..."
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setShowEditModal(false)}
                disabled={savingEdit}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={savingEdit || !editForm.service_type || !editForm.address || !editForm.date}
                className="inline-flex items-center rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {savingEdit ? (
                  <>
                    <svg className="h-4 w-4 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
