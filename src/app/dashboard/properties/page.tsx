'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import { Property, SERVICE_TYPE_LABELS } from '@/types/database';
import CreateJobsModal from '@/components/CreateJobsModal';
import { formatVisitDate } from '@/lib/jobVisits';
import { copyToClipboard, needsLocation, statusLinkFor } from '@/lib/properties';

type PropertyFilter = 'all' | 'missing_email' | 'missing_site_map' | 'needs_location';

// A property's Jobs are its job_visits rows (one per visit date)
type PropertyRow = Property & { job_visits: { date: string }[] };

const FILTER_LABELS: Record<PropertyFilter, string> = {
  all: 'All',
  missing_email: 'Missing email',
  missing_site_map: 'Missing site map',
  needs_location: 'Needs location',
};

function latestJobDate(row: PropertyRow): string | null {
  if (row.job_visits.length === 0) return null;
  return row.job_visits.reduce((latest, v) => (v.date > latest ? v.date : latest), row.job_visits[0].date);
}

const supabase = getSupabaseBrowserClient();

export default function PropertiesPage() {
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<PropertyFilter>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showCreateJobs, setShowCreateJobs] = useState(false);
  // Bumped to reload the list from the database, for example after Jobs were created
  const [reloadKey, setReloadKey] = useState(0);
  // The full-page spinner is for the first load only, so a reload leaves a dialog in place
  const hasLoadedOnce = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchProperties() {
      try {
        if (!hasLoadedOnce.current) setLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from('properties')
          .select('*, job_visits(date)')
          .order('address', { ascending: true });

        if (cancelled) return;
        if (fetchError) throw fetchError;
        setProperties((data ?? []) as PropertyRow[]);
        hasLoadedOnce.current = true;
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to fetch properties');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchProperties();
    return () => { cancelled = true; };
  }, [reloadKey]);

  async function handleCopyLink(propertyId: string) {
    const link = statusLinkFor(propertyId);
    if (await copyToClipboard(link)) {
      setCopiedId(propertyId);
      setTimeout(() => setCopiedId((current) => (current === propertyId ? null : current)), 2000);
    } else {
      window.prompt('Copy this status link:', link);
    }
  }

  const matchesFilter = (p: PropertyRow, f: PropertyFilter) =>
    f === 'all'
      ? true
      : f === 'missing_email'
        ? !p.client_email
        : f === 'missing_site_map'
          ? !p.overlay_image_url
          : needsLocation(p);

  const q = searchQuery.trim().toLowerCase();
  const filtered = properties.filter((p) => {
    const matchesSearch =
      !q ||
      p.address.toLowerCase().includes(q) ||
      (p.client_name ?? '').toLowerCase().includes(q) ||
      (p.client_email ?? '').toLowerCase().includes(q);
    return matchesSearch && matchesFilter(p, filter);
  });

  const counts: Record<PropertyFilter, number> = {
    all: properties.length,
    missing_email: properties.filter((p) => matchesFilter(p, 'missing_email')).length,
    missing_site_map: properties.filter((p) => matchesFilter(p, 'missing_site_map')).length,
    needs_location: properties.filter((p) => matchesFilter(p, 'needs_location')).length,
  };

  // Only properties that are shown can stay selected: changing the search or filter drops the rest,
  // so a batch never includes a property you can no longer see.
  const shownKey = filtered.map((p) => p.id).join(',');
  useEffect(() => {
    const shown = new Set(shownKey ? shownKey.split(',') : []);
    setSelected((prev) => {
      const kept = Array.from(prev).filter((id) => shown.has(id));
      return kept.length === prev.size ? prev : new Set(kept);
    });
  }, [shownKey]);

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allShownSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));
  const toggleAllShown = () => setSelected(allShownSelected ? new Set() : new Set(filtered.map((p) => p.id)));

  const servicesText = (p: PropertyRow) =>
    (p.default_services ?? []).length === 0
      ? null
      : (p.default_services ?? []).map((t) => SERVICE_TYPE_LABELS[t] ?? t).join(', ');

  const thumb = (p: PropertyRow, size: string) =>
    p.overlay_image_url ? (
      <Link href={`/dashboard/properties/${p.id}`} className="block shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.overlay_image_url} alt="Site map" className={`${size} rounded border border-gray-200 object-cover`} />
      </Link>
    ) : (
      <Link
        href={`/dashboard/properties/${p.id}`}
        className={`flex ${size} shrink-0 items-center justify-center rounded border border-dashed border-gray-300 text-center text-[10px] leading-tight text-gray-400`}
      >
        No site map
      </Link>
    );

  const locationTag = (p: PropertyRow) =>
    needsLocation(p) && (
      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
        Needs location
      </span>
    );

  const rowActions = (p: PropertyRow) => (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <Link href={`/dashboard/properties/${p.id}`} className="font-medium text-green-600 hover:text-green-700">
        Edit
      </Link>
      <Link href={`/dashboard/sites/new?property=${p.id}`} className="font-medium text-green-600 hover:text-green-700">
        New Job
      </Link>
      <button onClick={() => handleCopyLink(p.id)} className="font-medium text-gray-600 hover:text-gray-900">
        {copiedId === p.id ? 'Copied' : 'Copy status link'}
      </button>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center space-x-2">
          <svg className="h-6 w-6 animate-spin text-green-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-gray-600">Loading properties...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-600">{error}</p>
        <button onClick={() => window.location.reload()} className="mt-4 text-red-700 underline">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${selected.size > 0 ? 'pb-20' : ''}`}>
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Properties</h1>
          <p className="mt-1 text-sm text-gray-500">
            Every property and its client contact, with or without a Job
          </p>
        </div>
        <Link
          href="/dashboard/properties/new"
          className="inline-flex items-center space-x-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          <span>Add property</span>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            placeholder="Search address, name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
          <svg className="absolute left-3 top-3 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <div className="flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1">
          {(['all', 'missing_email', 'missing_site_map', 'needs_location'] as PropertyFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {FILTER_LABELS[f]}
              <span
                className={`ml-1.5 inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs ${
                  filter === f ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                }`}
              >
                {counts[f]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Selection: pick properties to create Jobs for a date */}
      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button onClick={toggleAllShown} className="font-medium text-green-700 hover:text-green-800">
            {allShownSelected ? 'Clear selection' : `Select all ${filtered.length} shown`}
          </button>
          <span className="text-gray-500">Tick properties to create Jobs for them on a date.</span>
        </div>
      )}

      {/* Properties - Desktop */}
      <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-10 px-4 py-4">
                  <input
                    type="checkbox"
                    aria-label="Select all shown properties"
                    checked={allShownSelected}
                    onChange={toggleAllShown}
                    className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                </th>
                {['Address', 'Client', 'Email', 'Services', 'Jobs', 'Latest Job', ''].map((h) => (
                  <th key={h} className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                    No properties found
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const latest = latestJobDate(p);
                  return (
                    <tr key={p.id} className={`align-top transition-colors hover:bg-gray-50 ${selected.has(p.id) ? 'bg-green-50/50' : ''}`}>
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          aria-label={`Select ${p.address}`}
                          checked={selected.has(p.id)}
                          onChange={() => toggleOne(p.id)}
                          className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                        />
                      </td>
                      <td className="px-4 py-4 text-sm font-medium text-gray-900">
                        <div className="flex items-start gap-3">
                          {thumb(p, 'h-10 w-14')}
                          <div>
                            <Link href={`/dashboard/properties/${p.id}`} className="hover:text-green-700">
                              {p.address}
                            </Link>
                            {locationTag(p)}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">{p.client_name || <span className="text-gray-400">—</span>}</td>
                      <td className="px-4 py-4 text-sm text-gray-700">{p.client_email || <span className="text-gray-400">—</span>}</td>
                      <td className="px-4 py-4 text-sm text-gray-700">{servicesText(p) || <span className="text-gray-400">None set</span>}</td>
                      <td className="px-4 py-4 text-sm text-gray-700">{p.job_visits.length}</td>
                      <td className="px-4 py-4 text-sm text-gray-700">
                        {latest ? formatVisitDate(latest) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-4">{rowActions(p)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Properties - Mobile */}
      <div className="space-y-3 md:hidden">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">
            No properties found
          </div>
        ) : (
          filtered.map((p) => {
            const latest = latestJobDate(p);
            return (
              <div key={p.id} className={`rounded-xl border bg-white p-4 shadow-sm ${selected.has(p.id) ? 'border-green-400' : 'border-gray-200'}`}>
                <label className="mb-2 flex items-center gap-2 text-xs text-gray-500">
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggleOne(p.id)}
                    className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  Select this property
                </label>
                <div className="flex items-start gap-3">
                  {thumb(p, 'h-14 w-20')}
                  <div className="min-w-0">
                    <Link href={`/dashboard/properties/${p.id}`} className="block text-sm font-medium text-gray-900">
                      {p.address}
                      {locationTag(p)}
                    </Link>
                    <p className="mt-1 text-sm text-gray-600">{p.client_name || 'No client name'}</p>
                    <p className="text-sm text-gray-600">{p.client_email || 'No email'}</p>
                  </div>
                </div>
                <p className="mt-1 text-xs text-gray-500">Services: {servicesText(p) || 'none set'}</p>
                <p className="mt-1 text-xs text-gray-400">
                  {p.job_visits.length} Job{p.job_visits.length !== 1 ? 's' : ''}
                  {latest && <> &middot; latest {formatVisitDate(latest)}</>}
                </p>
                <div className="mt-3 border-t border-gray-100 pt-3">{rowActions(p)}</div>
              </div>
            );
          })
        )}
      </div>

      {/* Selected: sticky action bar */}
      {selected.size > 0 && (
        <div
          role="region"
          aria-label="Selected properties"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white px-4 py-3 shadow-lg md:left-64"
        >
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium text-gray-900">{selected.size} selected</span>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowCreateJobs(true)}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                Create Jobs for a date
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateJobs && (
        <CreateJobsModal
          propertyIds={Array.from(selected)}
          onClose={() => setShowCreateJobs(false)}
          onApplied={() => {
            setSelected(new Set());
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
