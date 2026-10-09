'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import { Crew, JobStatus, Property, ServiceType, SERVICE_TYPE_LABELS } from '@/types/database';
import { getOrCreateVisit } from '@/lib/jobVisits';
import { findPropertyByAddress, geocodeAddress, normalizeAddress, ALL_SERVICE_TYPES } from '@/lib/properties';

const supabase = getSupabaseBrowserClient();

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
  const [crewIds, setCrewIds] = useState<string[]>([]);
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
  // The full row of the linked property, for its site map and default services
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  // Set when the services boxes were pre-checked from the property's defaults
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');

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

  // The Properties page links here with ?property=<id> to start a Job for that property.
  // Read from the address bar after mount rather than with useSearchParams, which would
  // need a Suspense boundary around the whole page.
  useEffect(() => {
    const propertyId = new URLSearchParams(window.location.search).get('property');
    if (!propertyId) return;

    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('properties').select('*').eq('id', propertyId).maybeSingle();
      if (!cancelled && data) selectPropertySuggestion(data as Property);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectPropertySuggestion(property: Property) {
    setAddress(property.address);
    setSelectedPropertyId(property.id);
    setSelectedProperty(property);
    // Pre-check the property's default services. They stay editable for this one Job. A property
    // with no defaults leaves whatever is already ticked alone.
    const defaults = property.default_services ?? [];
    if (defaults.length > 0) {
      setSelectedServices(ALL_SERVICE_TYPES.filter((t) => defaults.includes(t)));
      setDefaultsApplied(true);
    } else {
      setDefaultsApplied(false);
    }
    setClientName(property.client_name || '');
    setClientEmail(property.client_email || '');
    setShowSuggestions(false);
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

    const existing = await findPropertyByAddress(supabase, normalized);
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

      // One Job per property per date. If one already exists, the new services are
      // added to it rather than starting a second Job for the same visit.
      const visit = await getOrCreateVisit(supabase, propertyId, date);

      const { data: existingSubJobs, error: existingError } = await supabase
        .from('jobs')
        .select('service_type')
        .eq('job_visit_id', visit.id);
      if (existingError) throw existingError;

      const alreadyThere = selectedServices.filter((svc) =>
        (existingSubJobs || []).some((j: { service_type: string }) => j.service_type === svc)
      );
      if (alreadyThere.length > 0) {
        setFormError(
          `${alreadyThere.map((svc) => SERVICE_TYPE_LABELS[svc]).join(', ')} already exist${alreadyThere.length === 1 ? 's' : ''} on this property's Job for that date. Remove ${alreadyThere.length === 1 ? 'it' : 'them'} here, or open the existing Job.`
        );
        return;
      }

      // One Sub Job (a row in jobs) per selected service. crew_id starts empty: it is
      // filled in with whichever crew starts (claims) the Sub Job.
      const { error: insertError } = await supabase
        .from('jobs')
        .insert(
          selectedServices.map((serviceType) => ({
            service_type: serviceType,
            address: address.trim(),
            property_id: propertyId,
            job_visit_id: visit.id,
            date,
            time_window_start: timeWindowStart || null,
            time_window_end: timeWindowEnd || null,
            est_duration_min: estDuration ? parseInt(estDuration, 10) : null,
            crew_id: null,
            status,
            service_notes: serviceNotes.trim() || null,
            skid_steer_used: serviceType === 'plow_lot' ? skidSteerUsed : false,
          }))
        );

      if (insertError) throw insertError;

      // Crews are assigned to the Job as a whole. Only ever adds: crews already on an
      // existing Job for this date are left alone.
      if (crewIds.length > 0) {
        const { error: crewLinkError } = await supabase
          .from('job_visit_crews')
          .upsert(
            crewIds.map((crew_id) => ({ job_visit_id: visit.id, crew_id })),
            { onConflict: 'job_visit_id,crew_id', ignoreDuplicates: true }
          );
        if (crewLinkError) throw crewLinkError;
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
          Create a Job for a property visit. Any crew you pick can complete any of its Sub Jobs.
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
              {defaultsApplied && (
                <p className="mt-2 text-xs text-green-700">
                  Pre-checked from this property&apos;s default services. Change them for this Job if you need to.
                </p>
              )}
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
                  setSelectedProperty(null);
                  setDefaultsApplied(false);
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
              {selectedProperty && (
                <div className="mt-3 flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  {selectedProperty.overlay_image_url ? (
                    <a href={selectedProperty.overlay_image_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={selectedProperty.overlay_image_url}
                        alt="Site map"
                        className="h-16 w-24 rounded border border-gray-200 object-cover"
                      />
                    </a>
                  ) : (
                    <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded border-2 border-dashed border-gray-300 text-center text-xs text-gray-400">
                      No site map yet
                    </div>
                  )}
                  <div className="min-w-0 text-xs text-gray-600">
                    <p className="font-medium text-gray-800">Site map</p>
                    <p>
                      Crews see this on every Job at this property.{' '}
                      <Link
                        href={`/dashboard/properties/${selectedProperty.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-green-700 hover:text-green-800"
                      >
                        {selectedProperty.overlay_image_url ? 'Change it' : 'Add one'} on the Properties page
                      </Link>
                      .
                    </p>
                  </div>
                </div>
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
            Assignment
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Crew */}
            <div>
              <label
                htmlFor="crew"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Crews for this Job
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
                <div
                  id="crew"
                  className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-gray-300 p-2"
                >
                  {crews.map((crew) => (
                    <label
                      key={crew.id}
                      className="flex cursor-pointer items-center space-x-3 rounded-md px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={crewIds.includes(crew.id)}
                        onChange={(e) =>
                          setCrewIds((prev) =>
                            e.target.checked
                              ? [...prev, crew.id]
                              : prev.filter((id) => id !== crew.id)
                          )
                        }
                        className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                      />
                      <span>
                        {crew.name}
                        {crew.phone ? ` \u2014 ${crew.phone}` : ''}
                      </span>
                    </label>
                  ))}
                </div>
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
