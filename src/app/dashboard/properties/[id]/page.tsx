'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import { Property } from '@/types/database';
import PropertyForm from '@/components/PropertyForm';
import SiteMapField from '@/components/SiteMapField';
import { formatVisitDate } from '@/lib/jobVisits';
import { copyToClipboard, needsLocation, statusLinkFor } from '@/lib/properties';

const supabase = getSupabaseBrowserClient();

export default function PropertyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [property, setProperty] = useState<Property | null>(null);
  const [jobDates, setJobDates] = useState<string[]>([]);
  // Emails already sent about this property. Deleting the property keeps them but cuts the link.
  const [emailCount, setEmailCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [propertyRes, visitsRes, emailsRes] = await Promise.all([
          supabase.from('properties').select('*').eq('id', id).maybeSingle(),
          supabase.from('job_visits').select('date').eq('property_id', id),
          supabase.from('email_sends').select('id', { count: 'exact', head: true }).eq('property_id', id),
        ]);

        if (cancelled) return;
        if (propertyRes.error) throw propertyRes.error;
        if (visitsRes.error) throw visitsRes.error;
        setEmailCount(emailsRes.count ?? 0);

        setProperty(propertyRes.data as Property | null);
        setJobDates(((visitsRes.data ?? []) as { date: string }[]).map((v) => v.date));
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load this property');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [id]);

  async function handleCopyLink() {
    const link = statusLinkFor(id);
    if (await copyToClipboard(link)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      window.prompt('Copy this status link:', link);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      // Ask for the deleted row back: row-level security skips a row it will not let you
      // delete without raising an error, and no row back means nothing was deleted.
      const { data, error: deleteErr } = await supabase
        .from('properties')
        .delete()
        .eq('id', id)
        .select('id');

      if (deleteErr) {
        // 23503 = a Job still points at this property. The page already blocks this case, so
        // seeing it means a Job was added since the page loaded.
        if (deleteErr.code === '23503') {
          throw new Error('This property now has a Job, so it cannot be deleted. Reload the page.');
        }
        throw deleteErr;
      }
      if (!data || data.length === 0) {
        throw new Error('The property was not deleted. You may not have permission, or it no longer exists.');
      }
      router.push('/dashboard/properties');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete the property');
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-gray-600">Loading property...</span>
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

  if (!property) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
        <p className="text-gray-700">This property was not found. It may have been deleted.</p>
        <Link href="/dashboard/properties" className="mt-4 inline-block text-sm font-medium text-green-600 hover:text-green-700">
          Back to properties
        </Link>
      </div>
    );
  }

  const jobCount = jobDates.length;
  const latestJob = jobDates.length > 0 ? [...jobDates].sort().at(-1)! : null;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center space-x-2 text-sm text-gray-500">
        <Link href="/dashboard/properties" className="hover:text-gray-700">Properties</Link>
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="truncate text-gray-900">{property.address}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{property.address}</h1>
            {needsLocation(property) && (
              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                Needs location
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {jobCount} Job{jobCount !== 1 ? 's' : ''}
            {latestJob && <> &middot; latest {formatVisitDate(latestJob)}</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleCopyLink}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {copied ? 'Copied' : 'Copy status link'}
          </button>
          <Link
            href={`/dashboard/sites/new?property=${property.id}`}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            New Job
          </Link>
        </div>
      </div>

      {/* Edit */}
      <div className="max-w-2xl rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Details</h2>
        <PropertyForm property={property} onSaved={setProperty} />
        <p className="mt-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
          Changing the address updates how this property looks in the Admin lists, on the client&apos;s
          status page and in emails. Existing Jobs keep the address they were created with, which is
          what crews see on their Jobs. Jobs created from now on use the new address.
        </p>
      </div>

      {/* Site map */}
      <div className="max-w-2xl rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <SiteMapField
          propertyId={property.id}
          url={property.overlay_image_url}
          onChange={(url) => setProperty((prev) => (prev ? { ...prev, overlay_image_url: url } : prev))}
        />
      </div>

      {/* Delete */}
      <div className="max-w-2xl rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Delete property</h2>
        {jobCount > 0 ? (
          <>
            <p className="mt-1 text-sm text-gray-500">
              A property with Jobs cannot be deleted, so its history is never lost.
            </p>
            <button
              disabled
              className="mt-4 cursor-not-allowed rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-400"
            >
              Has {jobCount} Job{jobCount !== 1 ? 's' : ''}
            </button>
          </>
        ) : confirmingDelete ? (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-red-700">
              Delete this property? This cannot be undone.
              {emailCount > 0 &&
                ` ${emailCount} email${emailCount !== 1 ? 's' : ''} sent about it will stay in the email history, but will no longer show this property.`}
              {property.overlay_image_url && ' Its site map file stays in storage.'}
            </p>
            {deleteError && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {deleteError}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Yes, delete'}
              </button>
              <button
                onClick={() => { setConfirmingDelete(false); setDeleteError(null); }}
                disabled={deleting}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-1 text-sm text-gray-500">This property has no Jobs, so it can be deleted.</p>
            <button
              onClick={() => setConfirmingDelete(true)}
              className="mt-4 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Delete property
            </button>
          </>
        )}
      </div>
    </div>
  );
}
