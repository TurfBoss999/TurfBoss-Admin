import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { ApiErrorResponse } from '@/types/database';

// Create axios instance with base configuration
const apiClient = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // You can add auth headers here if needed
    // const token = getAuthToken();
    // if (token) {
    //   config.headers.Authorization = `Bearer ${token}`;
    // }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

// Response interceptor for global error handling
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  (error: AxiosError<ApiErrorResponse>) => {
    // Handle specific error codes
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      switch (status) {
        case 401:
          // Unauthorized - redirect to login
          if (typeof window !== 'undefined') {
            window.location.href = '/login';
          }
          break;
        case 403:
          // Forbidden - show error message
          console.error('Access denied:', data?.error || 'Forbidden');
          break;
        case 404:
          console.error('Resource not found:', data?.error || 'Not found');
          break;
        case 500:
          console.error('Server error:', data?.error || 'Internal server error');
          break;
        default:
          console.error('API error:', data?.error || 'Unknown error');
      }
    } else if (error.request) {
      // Network error
      console.error('Network error: No response received');
    } else {
      console.error('Request error:', error.message);
    }

    return Promise.reject(error);
  }
);

export default apiClient;

// Type helper for extracting data from API responses
export function extractData<T>(response: AxiosResponse<{ success: true; data: T }>): T {
  return response.data.data;
}
