'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import { Property } from '@/types/database';
import { formatVisitDate } from '@/lib/jobVisits';
import { copyToClipboard, needsLocation, statusLinkFor } from '@/lib/properties';

type PropertyFilter = 'all' | 'missing_email' | 'needs_location';

// A property's Jobs are its job_visits rows (one per visit date)
type PropertyRow = Property & { job_visits: { date: string }[] };

const FILTER_LABELS: Record<PropertyFilter, string> = {
  all: 'All',
  missing_email: 'Missing email',
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

  useEffect(() => {
    let cancelled = false;

    async function fetchProperties() {
      try {
        setLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from('properties')
          .select('*, job_visits(date)')
          .order('address', { ascending: true });

        if (cancelled) return;
        if (fetchError) throw fetchError;
        setProperties((data ?? []) as PropertyRow[]);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to fetch properties');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchProperties();
    return () => { cancelled = true; };
  }, []);

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
    f === 'all' ? true : f === 'missing_email' ? !p.client_email : needsLocation(p);

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
    needs_location: properties.filter((p) => matchesFilter(p, 'needs_location')).length,
  };

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
    <div className="space-y-6">
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
          {(['all', 'missing_email', 'needs_location'] as PropertyFilter[]).map((f) => (
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

      {/* Properties - Desktop */}
      <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Address', 'Client', 'Email', 'Jobs', 'Latest Job', ''].map((h) => (
                  <th key={h} className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    No properties found
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const latest = latestJobDate(p);
                  return (
                    <tr key={p.id} className="align-top transition-colors hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        <Link href={`/dashboard/properties/${p.id}`} className="hover:text-green-700">
                          {p.address}
                        </Link>
                        {locationTag(p)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">{p.client_name || <span className="text-gray-400">—</span>}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{p.client_email || <span className="text-gray-400">—</span>}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{p.job_visits.length}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {latest ? formatVisitDate(latest) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-6 py-4">{rowActions(p)}</td>
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
              <div key={p.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <Link href={`/dashboard/properties/${p.id}`} className="block text-sm font-medium text-gray-900">
                  {p.address}
                  {locationTag(p)}
                </Link>
                <p className="mt-1 text-sm text-gray-600">{p.client_name || 'No client name'}</p>
                <p className="text-sm text-gray-600">{p.client_email || 'No email'}</p>
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
    </div>
  );
}
