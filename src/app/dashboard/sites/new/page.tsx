'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import { Crew, JobStatus, Property, ServiceType, SERVICE_TYPE_LABELS } from '@/types/database';

const ALL_SERVICE_TYPES: ServiceType[] = ['salt_lot', 'plow_lot', 'salt_walk', 'shovel_walks'];

const supabase = getSupabaseBrowserClient();

function normalizeAddress(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export default function AddJobPage() {
  const router = useRouter();

  // Crews for assignment dropdown
  const [crews, setCrews] = useState<Crew[]>([]);
  const [loadingCrews, setLoadingCrews] = useState(true);

  // Form fields
  const [selectedServices, setSelectedServices] = useState<ServiceType[]>([]);
  const [skidSteerUsed, setSkidSteerUsed] = useState(false);
  const [address, setAddress] = useState('');
  const [date, setDate] = useState('');
  const [timeWindowStart, setTimeWindowStart] = useState('');
  const [timeWindowEnd, setTimeWindowEnd] = useState('');
  const [estDuration, setEstDuration] = useState('');
  const [crewId, setCrewId] = useState('');
  const [status, setStatus] = useState<JobStatus>('scheduled');
  const [serviceNotes, setServiceNotes] = useState('');

  function toggleService(type: ServiceType) {
    setSelectedServices((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }

  // Property linking state
  const [propertySuggestions, setPropertySuggestions] = useState<Property[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');

  // Image upload state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCrews() {
      try {
        const { data, error } = await supabase
          .from('crews')
          .select('*')
          .order('name', { ascending: true });

        if (error) throw error;
        setCrews(data as Crew[]);
      } catch {
        // Crews are optional - don't block on failure
      } finally {
        setLoadingCrews(false);
      }
    }

    fetchCrews();
  }, []);

  useEffect(() => {
    const query = normalizeAddress(address);
    if (selectedPropertyId || query.length < 3) {
      setPropertySuggestions([]);
      return;
    }

    let cancelled = false;
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from('properties')
        .select('*')
        .ilike('address', `%${query}%`)
        .order('address', { ascending: true })
        .limit(5);

      if (!cancelled) {
        setPropertySuggestions((data as Property[]) || []);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [address, selectedPropertyId]);

  function selectPropertySuggestion(property: Property) {
    setAddress(property.address);
    setSelectedPropertyId(property.id);
    setClientName(property.client_name || '');
    setClientEmail(property.client_email || '');
    setShowSuggestions(false);
  }

  // Geocodes server-side via /api/admin/geocode so the Google API key never
  // reaches the browser. A failed geocode is logged server-side and treated
  // as null coordinates rather than blocking job creation.
  async function geocodeAddress(rawAddress: string): Promise<{ lat: number | null; lng: number | null }> {
    try {
      const response = await fetch('/api/admin/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: rawAddress }),
      });
      const json = await response.json();
      if (json.success) return json.data;
    } catch {
      // Property is still created below, just without coordinates.
    }
    return { lat: null, lng: null };
  }

  // Resolves the property to link this job to: the selected suggestion if
  // one was picked, otherwise an exact address match if one exists, otherwise
  // a newly created (and freshly geocoded) property row — mirrors how the
  // original backfill grouped jobs onto properties by exact address.
  async function resolvePropertyId(rawAddress: string): Promise<string> {
    if (selectedPropertyId) {
      await applyClientInfo(selectedPropertyId);
      return selectedPropertyId;
    }

    const normalized = normalizeAddress(rawAddress);

    const { data: existing, error: lookupError } = await supabase
      .from('properties')
      .select('id')
      .ilike('address', normalized)
      .limit(1)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (existing) {
      await applyClientInfo(existing.id);
      return existing.id;
    }

    const { lat, lng } = await geocodeAddress(normalized);

    const { data: created, error: createError } = await supabase
      .from('properties')
      .insert({
        address: normalized,
        lat,
        lng,
        client_name: clientName.trim() || null,
        client_email: clientEmail.trim() || null,
      })
      .select('id')
      .single();

    if (createError) throw createError;
    return created.id;
  }

  // Writes client contact info onto an already-existing property — covers
  // both filling in a legacy property with no contact on file yet, and
  // correcting/updating one that already has it. A no-op when both fields
  // are empty, so re-submitting an unrelated job never blanks out a
  // property's existing contact info.
  async function applyClientInfo(propertyId: string) {
    if (!clientName.trim() && !clientEmail.trim()) return;

    const { error } = await supabase
      .from('properties')
      .update({
        client_name: clientName.trim() || null,
        client_email: clientEmail.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', propertyId);

    if (error) throw error;
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Limit to 5 images total
    const remaining = 5 - selectedFiles.length;
    const newFiles = files.slice(0, remaining);

    setSelectedFiles((prev) => [...prev, ...newFiles]);

    // Generate previews
    newFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreviews((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });

    // Reset input so same file can be re-selected
    e.target.value = '';
  }

  function removeImage(index: number) {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  }

  async function uploadImages(jobId: string): Promise<string[]> {
    const urls: string[] = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      setUploadProgress(`Uploading image ${i + 1} of ${selectedFiles.length}...`);

      const ext = file.name.split('.').pop() || 'jpg';
      const filePath = `${jobId}/${Date.now()}-${i}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('job-images')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('job-images')
        .getPublicUrl(filePath);

      urls.push(urlData.publicUrl);
    }

    setUploadProgress(null);
    return urls;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    // Validate required fields
    if (selectedServices.length === 0) {
      setFormError('Select at least one service');
      return;
    }
    if (!address.trim()) {
      setFormError('Address is required');
      return;
    }
    if (!date) {
      setFormError('Date is required');
      return;
    }

    try {
      setSubmitting(true);

      const propertyId = await resolvePropertyId(address);

      // One job row per selected service, sharing this same visit's
      // property/date/crew/schedule — matches the paper tracking sheet's
      // per-service columns rather than one row per property visit.
      const { data: newJobs, error: insertError } = await supabase
        .from('jobs')
        .insert(
          selectedServices.map((serviceType) => ({
            service_type: serviceType,
            address: address.trim(),
            property_id: propertyId,
            date,
            time_window_start: timeWindowStart || null,
            time_window_end: timeWindowEnd || null,
            est_duration_min: estDuration ? parseInt(estDuration, 10) : null,
            crew_id: crewId || null,
            status,
            service_notes: serviceNotes.trim() || null,
            skid_steer_used: serviceType === 'plow_lot' ? skidSteerUsed : false,
          }))
        )
        .select();

      if (insertError) throw insertError;

      // Upload images if any were selected — attached to just the first
      // created job rather than duplicated across every service.
      const primaryJob = newJobs?.[0];
      if (selectedFiles.length > 0 && primaryJob) {
        const imageUrls = await uploadImages(primaryJob.id);

        if (imageUrls.length > 0) {
          const { error: updateError } = await supabase
            .from('jobs')
            .update({ image_urls: imageUrls })
            .eq('id', primaryJob.id);

          if (updateError) {
            console.error('Failed to save image URLs:', updateError);
            // Job was created, just images weren't linked — still redirect
          }
        }
      }

      router.push('/dashboard/sites');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to create job';
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center space-x-2 text-sm text-gray-500">
        <Link href="/dashboard" className="hover:text-gray-700">
          Dashboard
        </Link>
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
        <Link href="/dashboard/sites" className="hover:text-gray-700">
          Jobs
        </Link>
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
        <span className="text-gray-900">New Job</span>
      </nav>

      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Add New Job</h1>
        <p className="mt-1 text-sm text-gray-500">
          Create a new snow removal job and optionally assign it to a crew
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Service & Address Card */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Job Details
          </h2>
          <div className="space-y-4">
            {/* Service Type */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Services <span className="text-red-500">*</span>
              </label>
              <p className="mb-2 text-xs text-gray-400">
                One job is created per service selected, each independently tracked.
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {ALL_SERVICE_TYPES.map((type) => (
                  <label
                    key={type}
                    className={`flex cursor-pointer items-center space-x-2 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                      selectedServices.includes(type)
                        ? 'border-green-500 bg-green-50 text-green-800'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedServices.includes(type)}
                      onChange={() => toggleService(type)}
                      className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    <span>{SERVICE_TYPE_LABELS[type]}</span>
                  </label>
                ))}
              </div>
              {selectedServices.includes('plow_lot') && (
                <label className="mt-3 flex cursor-pointer items-center space-x-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={skidSteerUsed}
                    onChange={(e) => setSkidSteerUsed(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  <span>Skid steer used (Plow Lot)</span>
                </label>
              )}
            </div>

            {/* Address */}
            <div className="relative">
              <label
                htmlFor="address"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Address <span className="text-red-500">*</span>
              </label>
              <input
                id="address"
                type="text"
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  setSelectedPropertyId(null);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="e.g. 123 Main St, Anytown, USA"
                autoComplete="off"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
              {selectedPropertyId && (
                <p className="mt-1 text-xs text-green-700">Linked to existing property</p>
              )}
              {!selectedPropertyId &&
                normalizeAddress(address).length >= 3 &&
                propertySuggestions.length === 0 && (
                  <p className="mt-1 text-xs text-gray-400">
                    No match found — a new property will be created for this address
                  </p>
                )}
              {showSuggestions && propertySuggestions.length > 0 && (
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                  {propertySuggestions.map((property) => (
                    <button
                      key={property.id}
                      type="button"
                      onMouseDown={() => selectPropertySuggestion(property)}
                      className="block w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-green-50"
                    >
                      {property.address}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Client Contact Info */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="client-name"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Client Name
                </label>
                <input
                  id="client-name"
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="e.g. Jane Smith"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
              <div>
                <label
                  htmlFor="client-email"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Client Email
                </label>
                <input
                  id="client-email"
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="e.g. jane@example.com"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
            </div>

            {/* Service Notes */}
            <div>
              <label
                htmlFor="service-notes"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Service Notes
              </label>
              <textarea
                id="service-notes"
                value={serviceNotes}
                onChange={(e) => setServiceNotes(e.target.value)}
                placeholder="Checklist or instructions for the crew..."
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            </div>
          </div>
        </div>

        {/* Scheduling Card */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Schedule
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Date */}
            <div>
              <label
                htmlFor="date"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Date <span className="text-red-500">*</span>
              </label>
              <input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            </div>

            {/* Estimated Duration */}
            <div>
              <label
                htmlFor="est-duration"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Est. Duration (minutes)
              </label>
              <input
                id="est-duration"
                type="number"
                min="0"
                value={estDuration}
                onChange={(e) => setEstDuration(e.target.value)}
                placeholder="e.g. 60"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            </div>

            {/* Time Window Start */}
            <div>
              <label
                htmlFor="time-start"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Time Window Start
              </label>
              <input
                id="time-start"
                type="time"
                value={timeWindowStart}
                onChange={(e) => setTimeWindowStart(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            </div>

            {/* Time Window End */}
            <div>
              <label
                htmlFor="time-end"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Time Window End
              </label>
              <input
                id="time-end"
                type="time"
                value={timeWindowEnd}
                onChange={(e) => setTimeWindowEnd(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            </div>
          </div>
        </div>

        {/* Assignment Card */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Images
          </h2>
          <div className="space-y-4">
            {/* File Input */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Job Photos{' '}
                <span className="text-gray-400 font-normal">
                  (up to 5 images)
                </span>
              </label>
              <label
                htmlFor="image-upload"
                className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 transition-colors ${
                  selectedFiles.length >= 5
                    ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
                    : 'border-gray-300 hover:border-green-400 hover:bg-green-50'
                }`}
              >
                <svg
                  className="h-10 w-10 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <p className="mt-2 text-sm text-gray-600">
                  {selectedFiles.length >= 5
                    ? 'Maximum images reached'
                    : 'Click to upload or drag and drop'}
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  PNG, JPG, WEBP up to 5MB each
                </p>
                <input
                  id="image-upload"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  onChange={handleFileSelect}
                  disabled={selectedFiles.length >= 5}
                  className="hidden"
                />
              </label>
            </div>

            {/* Image Previews */}
            {imagePreviews.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
                {imagePreviews.map((preview, index) => (
                  <div key={index} className="group relative">
                    <div className="aspect-square overflow-hidden rounded-lg border border-gray-200">
                      <img
                        src={preview}
                        alt={`Preview ${index + 1}`}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow-sm opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-600"
                    >
                      <svg
                        className="h-3.5 w-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Assignment Card */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Assignment
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Crew */}
            <div>
              <label
                htmlFor="crew"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Assign to Crew
              </label>
              {loadingCrews ? (
                <div className="flex items-center space-x-2 py-2.5 text-sm text-gray-400">
                  <svg
                    className="h-4 w-4 animate-spin"
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
                  <span>Loading crews...</span>
                </div>
              ) : (
                <select
                  id="crew"
                  value={crewId}
                  onChange={(e) => setCrewId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                >
                  <option value="">Unassigned</option>
                  {crews.map((crew) => (
                    <option key={crew.id} value={crew.id}>
                      {crew.name}
                      {crew.phone ? ` — ${crew.phone}` : ''}
                    </option>
                  ))}
                </select>
              )}
              {!loadingCrews && crews.length === 0 && (
                <p className="mt-1 text-xs text-gray-400">
                  No crews yet.{' '}
                  <Link
                    href="/dashboard/teams"
                    className="text-green-600 hover:text-green-700"
                  >
                    Add a team first
                  </Link>
                </p>
              )}
            </div>

            {/* Status */}
            <div>
              <label
                htmlFor="status"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Initial Status
              </label>
              <select
                id="status"
                value={status}
                onChange={(e) => setStatus(e.target.value as JobStatus)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              >
                <option value="scheduled">Scheduled</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
        </div>

        {/* Error Display */}
        {formError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {formError}
          </div>
        )}

        {/* Upload Progress */}
        {uploadProgress && (
          <div className="flex items-center space-x-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            <svg
              className="h-4 w-4 animate-spin"
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
            <span>{uploadProgress}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end space-x-3 pb-6">
          <Link
            href="/dashboard/sites"
            className="rounded-lg border border-gray-300 bg-white px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center space-x-2 rounded-lg bg-green-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <>
                <svg
                  className="h-4 w-4 animate-spin"
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
                <span>Creating...</span>
              </>
            ) : (
              <span>Create Job</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
