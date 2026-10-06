import apiClient, { extractData } from '@/lib/axios';
import { Crew, ApiSuccessResponse } from '@/types/database';

/**
 * Admin API Service Layer
 * Provides typed methods for interacting with admin API endpoints
 */
export const adminApi = {
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
