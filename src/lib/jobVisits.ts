import type { SupabaseClient } from '@supabase/supabase-js';
import { Job, JobStatus, JobVisit } from '@/types/database';

export type BadgeStatus = 'Pending' | 'In Progress' | 'Completed' | 'Cancelled';

export function badgeStatus(status: JobStatus): BadgeStatus {
  switch (status) {
    case 'in_progress':
      return 'In Progress';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Pending';
  }
}

// A Job's status is computed from its Sub Jobs, never stored: Completed when every
// active Sub Job is done, In Progress once any has started or finished, Cancelled
// only when all of them are, otherwise Pending (scheduled).
export function visitStatus(jobs: Pick<Job, 'status'>[]): JobStatus {
  if (jobs.length === 0) return 'scheduled';
  const active = jobs.filter((j) => j.status !== 'cancelled');
  if (active.length === 0) return 'cancelled';
  if (active.every((j) => j.status === 'completed')) return 'completed';
  if (active.some((j) => j.status === 'in_progress' || j.status === 'completed')) return 'in_progress';
  return 'scheduled';
}

// "Available" is its own UI state, separate from status: nobody has claimed the
// Sub Job yet, so any crew assigned to the Job can pick it up. A crew claims a Sub Job
// by starting it (that sets crew_id), so Available normally means scheduled; an
// in-progress Sub Job with no crew was started by an admin. It stops applying once
// the Sub Job is finished or cancelled.
export function isAvailable(job: Pick<Job, 'crew_id' | 'status'>): boolean {
  return !job.crew_id && (job.status === 'scheduled' || job.status === 'in_progress');
}

// One Job per property per date. Safe to call repeatedly: it returns the existing
// visit when there is one (the table has UNIQUE (property_id, date)).
export async function getOrCreateVisit(
  supabase: SupabaseClient,
  propertyId: string,
  date: string
): Promise<JobVisit> {
  const { data, error } = await supabase
    .from('job_visits')
    .upsert({ property_id: propertyId, date }, { onConflict: 'property_id,date' })
    .select()
    .single();

  if (error) throw error;
  return data as JobVisit;
}

export function formatVisitDate(date: string, long = false): string {
  return new Date(date + 'T00:00:00').toLocaleDateString(
    'en-US',
    long
      ? { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' }
  );
}
