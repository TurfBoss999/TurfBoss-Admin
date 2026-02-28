// Database types for Supabase tables

export type UserRole = 'admin' | 'crew';

export type JobStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

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
}

export interface Job {
  id: string;
  date: string;
  address: string;
  service_type: string;
  time_window_start: string | null;
  time_window_end: string | null;
  est_duration_min: number | null;
  notes: string | null;
  lat: number | null;
  lng: number | null;
  crew_id: string | null;
  status: JobStatus;
  completion_photo_url: string | null;
  image_urls: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface JobWithCrew extends Job {
  crew: Crew | null;
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
  service_type: string;
  time_window_start?: string;
  time_window_end?: string;
  est_duration_min?: number;
  notes?: string;
  lat?: number;
  lng?: number;
  crew_id?: string;
  status?: JobStatus;
  image_urls?: string[];
}

export interface UpdateJobDto {
  date?: string;
  address?: string;
  service_type?: string;
  time_window_start?: string;
  time_window_end?: string;
  est_duration_min?: number;
  notes?: string;
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
}
