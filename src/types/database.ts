// Database types for Supabase tables

export type UserRole = 'admin' | 'crew';

export type JobStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export type ServiceType = 'salt_lot' | 'plow_lot' | 'salt_walk' | 'shovel_walks';

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  salt_lot: 'Salt Lot',
  plow_lot: 'Plow Lot',
  salt_walk: 'Salt Walk',
  shovel_walks: 'Shovel Walks',
};

export interface Profile {
  id: string;
  role: UserRole;
  crew_id: string | null;
}

export interface Crew {
  id: string;
  name: string;
  phone: string | null;
  truck_number: string | null;
  // A resting crew drops out of assignment pickers but keeps its history and its login
  is_active: boolean;
}

export interface Property {
  id: string;
  address: string;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  overlay_image_url: string | null;
  client_name: string | null;
  client_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: string;
  date: string;
  address: string;
  service_type: ServiceType;
  time_window_start: string | null;
  time_window_end: string | null;
  est_duration_min: number | null;
  service_notes: string | null;
  field_notes: string | null;
  lat: number | null;
  lng: number | null;
  crew_id: string | null;
  property_id: string | null;
  job_visit_id: string | null;
  status: JobStatus;
  started_at: string | null;
  completed_at: string | null;
  image_urls: string[] | null;
  skid_steer_used: boolean;
  created_at: string;
  updated_at: string;
}

export interface JobWithCrew extends Job {
  crew: Crew | null;
  property: Property | null;
}

// A "Job" in the UI is a property visit: one row per property per date, with each
// service underneath it stored as a row in the `jobs` table (shown as a "Sub Job").
export interface JobVisit {
  id: string;
  property_id: string;
  date: string;
  // Stop number on the day's route (1 = first stop). Null until the Job is planned on the Routes
  // page, and set back to null whenever the Job's date changes.
  route_order?: number | null;
  created_at: string;
}

export interface JobVisitCrew {
  job_visit_id: string;
  crew_id: string;
}

export interface JobVisitWithDetails extends JobVisit {
  property: Property | null;
  crews: { crew: Crew | null }[];
  jobs: JobWithCrew[];
}

export type PhotoType = 'before' | 'after' | 'issue';

export interface JobPhoto {
  id: string;
  job_id: string;
  photo_url: string;
  photo_type: PhotoType;
  uploaded_at: string;
  uploaded_by: string | null;
}

export type EmailTemplate = 'storm_delay' | 'service_completion';

export const EMAIL_TEMPLATE_LABELS: Record<EmailTemplate, string> = {
  storm_delay: 'Storm Delay Notice',
  service_completion: 'Service Completion Notice',
};

export type EmailSendStatus = 'sent' | 'failed';

export interface EmailSend {
  id: string;
  template: EmailTemplate;
  subject: string;
  body: string;
  recipient_email: string;
  property_id: string | null;
  status: EmailSendStatus;
  error_message: string | null;
  sent_by: string | null;
  created_at: string;
}

export interface EmailRecipient {
  property_id: string;
  address: string;
  client_name: string | null;
  client_email: string;
}

// API Response types
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// Create/Update DTOs
export interface CreateJobDto {
  date: string;
  address: string;
  service_type: ServiceType;
  time_window_start?: string;
  time_window_end?: string;
  est_duration_min?: number;
  service_notes?: string;
  lat?: number;
  lng?: number;
  crew_id?: string;
  status?: JobStatus;
  image_urls?: string[];
}

export interface UpdateJobDto {
  date?: string;
  address?: string;
  service_type?: ServiceType;
  time_window_start?: string;
  time_window_end?: string;
  est_duration_min?: number;
  service_notes?: string;
  lat?: number;
  lng?: number;
  crew_id?: string;
  status?: JobStatus;
  image_urls?: string[];
}

export interface CreateCrewDto {
  name: string;
  phone?: string;
  truck_number?: string;
  email: string;
  password: string;
}

export interface UpdateCrewDto {
  name?: string;
  phone?: string;
  truck_number?: string;
  is_active?: boolean;
}

// ---- Mass rescheduling (the mass_reschedule_* database functions) ----
// A "Job" here is a job_visits row; dates are plain YYYY-MM-DD strings.
export type RescheduleMode = 'move' | 'copy';

export interface ReschedulePreviewRow {
  visit_id: string;
  address: string | null;
  source_date: string;
  action: 'move' | 'copy' | 'skip';
  reason: string | null;
  sub_job_count: number;
  crews_carried: number;
  inactive_crews_skipped: number;
}

export interface RescheduleResult {
  mode: RescheduleMode;
  target_date: string;
  moved_jobs: number;
  moved_sub_jobs: number;
  copied_jobs: number;
  created_sub_jobs: number;
  crews_carried: number;
  inactive_crews_skipped: number;
  skipped_count: number;
  moved: string[];
  created: { source_job_id: string; new_job_id: string }[];
  skipped: { job_id: string; address: string | null; reason: string }[];
}

// What assign_route_groups returns after saving a route plan
export interface AssignRouteResult {
  groups: number;
  jobs: number;
  route_orders_set: number;
  crew_assignments_added: number;
  crew_assignments_removed: number;
  crews_kept_because_started: number;
}
