// Site type
export interface Site {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  status: 'Pending' | 'In Progress' | 'Completed';
  images: string[];
}

// Task type
export interface Task {
  id: string;
  title: string;
  status: 'Pending' | 'In Progress' | 'Completed';
  assignedTeam: string;
  siteId?: string;
}

// User type
export interface User {
  email: string;
  role: 'admin';
  name: string;
}

// Dashboard stats type
export interface DashboardStats {
  totalSites: number;
  activeSites: number;
  pendingTasks: number;
  teamsAvailable: number;
}

// Re-export database types
export * from './database';
