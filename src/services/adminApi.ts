import apiClient, { extractData } from '@/lib/axios';
import {
  JobWithCrew,
  Crew,
  CreateJobDto,
  UpdateJobDto,
  ApiSuccessResponse,
} from '@/types/database';

/**
 * Admin API Service Layer
 * Provides typed methods for interacting with admin API endpoints
 */
export const adminApi = {
  // ==================== JOBS ====================

  /**
   * Fetch all jobs with crew information
   */
  async getJobs(): Promise<JobWithCrew[]> {
    const response = await apiClient.get<ApiSuccessResponse<JobWithCrew[]>>(
      '/admin/jobs'
    );
    return extractData(response);
  },

  /**
   * Fetch a single job by ID
   */
  async getJob(id: string): Promise<JobWithCrew> {
    const response = await apiClient.get<ApiSuccessResponse<JobWithCrew>>(
      `/admin/jobs/${id}`
    );
    return extractData(response);
  },

  /**
   * Create a new job
   */
  async createJob(data: CreateJobDto): Promise<JobWithCrew> {
    const response = await apiClient.post<ApiSuccessResponse<JobWithCrew>>(
      '/admin/jobs',
      data
    );
    return extractData(response);
  },

  /**
   * Update an existing job
   */
  async updateJob(id: string, data: UpdateJobDto): Promise<JobWithCrew> {
    const response = await apiClient.put<ApiSuccessResponse<JobWithCrew>>(
      `/admin/jobs/${id}`,
      data
    );
    return extractData(response);
  },

  /**
   * Delete a job
   */
  async deleteJob(id: string): Promise<{ deleted: boolean }> {
    const response = await apiClient.delete<ApiSuccessResponse<{ deleted: boolean }>>(
      `/admin/jobs/${id}`
    );
    return extractData(response);
  },

  // ==================== CREWS ====================

  /**
   * Fetch all crews
   */
  async getCrews(): Promise<Crew[]> {
    const response = await apiClient.get<ApiSuccessResponse<Crew[]>>(
      '/admin/crews'
    );
    return extractData(response);
  },
};

export default adminApi;
