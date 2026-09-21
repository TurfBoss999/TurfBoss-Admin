import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { Job, JobPhoto, SERVICE_TYPE_LABELS } from '@/types/database';

// This page is public and unauthenticated — it must never run a query with
// the anon/publishable key, since RLS can't scope "only this one property"
// for a table-wide read grant. It fetches everything server-side with the
// service role key instead, so no broad public read policy is ever needed
// on properties/jobs, and the browser never sees any Supabase key at all.
export const dynamic = 'force-dynamic';

interface StatusPageProps {
  params: Promise<{ propertyId: string }>;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function statusLine(job: Job): string {
  if (job.status === 'completed' && job.completed_at) return `Done at ${formatTime(job.completed_at)}`;
  if (job.status === 'in_progress') return 'In progress';
  if (job.status === 'cancelled') return 'Cancelled';
  return 'Pending';
}

function statusColor(job: Job): string {
  if (job.status === 'completed') return 'bg-green-100 text-green-800 border-green-200';
  if (job.status === 'in_progress') return 'bg-blue-100 text-blue-800 border-blue-200';
  if (job.status === 'cancelled') return 'bg-gray-100 text-gray-600 border-gray-200';
  return 'bg-yellow-100 text-yellow-800 border-yellow-200';
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-2xl px-4 py-5">
          <div className="flex items-center space-x-2">
            <svg className="h-7 w-7 text-green-600" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
            </svg>
            <span className="text-lg font-bold text-gray-900">TurfBoss</span>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-2xl px-4 py-8">{children}</div>
    </div>
  );
}

export default async function PropertyStatusPage({ params }: StatusPageProps) {
  const { propertyId } = await params;
  const supabase = createSupabaseAdminClient();

  const { data: property } = await supabase
    .from('properties')
    .select('id, address')
    .eq('id', propertyId)
    .maybeSingle();

  if (!property) {
    return (
      <Shell>
        <p className="text-gray-600">
          We couldn&apos;t find that property. Please check the link and try again.
        </p>
      </Shell>
    );
  }

  const { data: allJobs } = await supabase
    .from('jobs')
    .select('*')
    .eq('property_id', propertyId)
    .order('date', { ascending: true });

  const jobs: Job[] = allJobs || [];

  if (jobs.length === 0) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold text-gray-900">{property.address}</h1>
        <p className="mt-3 text-gray-600">No service visits recorded yet for this property.</p>
      </Shell>
    );
  }

  // "Current visit" = the most recent date at or before today that has
  // jobs, or the soonest upcoming date if nothing has happened yet.
  const today = new Date().toISOString().split('T')[0];
  const pastOrToday = jobs.filter((j) => j.date <= today);
  const future = jobs.filter((j) => j.date > today);
  const targetDate =
    pastOrToday.length > 0
      ? pastOrToday[pastOrToday.length - 1].date
      : future[0]?.date;

  const visitJobs = jobs.filter((j) => j.date === targetDate);
  const visitJobIds = visitJobs.map((j) => j.id);

  const { data: photos } = await supabase
    .from('job_photos')
    .select('*')
    .in('job_id', visitJobIds)
    .in('photo_type', ['before', 'after']);

  const photosByJob = new Map<string, JobPhoto[]>();
  for (const photo of (photos as JobPhoto[]) || []) {
    const list = photosByJob.get(photo.job_id) || [];
    list.push(photo);
    photosByJob.set(photo.job_id, list);
  }

  return (
    <Shell>
      <h1 className="text-xl font-semibold text-gray-900">{property.address}</h1>
      <p className="mt-1 text-sm text-gray-500">{formatDate(targetDate)}</p>

      <div className="mt-6 space-y-4">
        {visitJobs.map((job) => {
          const jobPhotos = photosByJob.get(job.id) || [];
          return (
            <div key={job.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-900">
                  {SERVICE_TYPE_LABELS[job.service_type]}
                </h2>
                <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${statusColor(job)}`}>
                  {statusLine(job)}
                </span>
              </div>

              {jobPhotos.length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {jobPhotos.map((photo) => (
                    <div key={photo.id} className="space-y-1">
                      <div className="aspect-square overflow-hidden rounded-lg border border-gray-200">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.photo_url}
                          alt={`${photo.photo_type} photo`}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <p className="text-center text-xs capitalize text-gray-400">{photo.photo_type}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Shell>
  );
}
