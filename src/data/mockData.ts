import { Site, Task, User, DashboardStats } from '@/types';

// Mock user data
export const mockUser: User = {
  email: 'admin@turfboss.com',
  role: 'admin',
  name: 'John Admin',
};

// Mock sites data
export const mockSites: Site[] = [
  {
    id: '1',
    name: 'Central Park Lawn',
    address: '123 Central Park West, New York, NY 10023',
    latitude: 40.7829,
    longitude: -73.9654,
    status: 'Completed',
    images: [
      'https://images.unsplash.com/photo-1558904541-efa843a96f01?w=400&h=300&fit=crop',
      'https://images.unsplash.com/photo-1566024287286-457247b70310?w=400&h=300&fit=crop',
      'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=400&h=300&fit=crop',
    ],
  },
  {
    id: '2',
    name: 'Stadium Field A',
    address: '456 Sports Blvd, Los Angeles, CA 90012',
    latitude: 34.0736,
    longitude: -118.2406,
    status: 'In Progress',
    images: [
      'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=400&h=300&fit=crop',
      'https://images.unsplash.com/photo-1589487391730-58f20eb2c308?w=400&h=300&fit=crop',
    ],
  },
  {
    id: '3',
    name: 'Golf Course Green',
    address: '789 Fairway Lane, Miami, FL 33109',
    latitude: 25.7617,
    longitude: -80.1918,
    status: 'Pending',
    images: [
      'https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?w=400&h=300&fit=crop',
    ],
  },
  {
    id: '4',
    name: 'Community Soccer Field',
    address: '321 Community Drive, Austin, TX 78701',
    latitude: 30.2672,
    longitude: -97.7431,
    status: 'In Progress',
    images: [
      'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=400&h=300&fit=crop',
      'https://images.unsplash.com/photo-1518604666860-9ed391f76460?w=400&h=300&fit=crop',
    ],
  },
  {
    id: '5',
    name: 'University Quad',
    address: '555 University Ave, Seattle, WA 98105',
    latitude: 47.6553,
    longitude: -122.3035,
    status: 'Completed',
    images: [
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400&h=300&fit=crop',
    ],
  },
  {
    id: '6',
    name: 'Private Estate Lawn',
    address: '888 Hilltop Road, Denver, CO 80203',
    latitude: 39.7392,
    longitude: -104.9903,
    status: 'Pending',
    images: [
      'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=400&h=300&fit=crop',
      'https://images.unsplash.com/photo-1583608205776-bfd35f0d9f83?w=400&h=300&fit=crop',
    ],
  },
];

// Mock tasks data
export const mockTasks: Task[] = [
  {
    id: '1',
    title: 'Initial soil assessment',
    status: 'Completed',
    assignedTeam: 'Team Alpha',
    siteId: '1',
  },
  {
    id: '2',
    title: 'Fertilizer application',
    status: 'In Progress',
    assignedTeam: 'Team Beta',
    siteId: '1',
  },
  {
    id: '3',
    title: 'Lawn mowing - Section A',
    status: 'In Progress',
    assignedTeam: 'Team Alpha',
    siteId: '2',
  },
  {
    id: '4',
    title: 'Irrigation system check',
    status: 'Pending',
    assignedTeam: 'Team Gamma',
    siteId: '2',
  },
  {
    id: '5',
    title: 'Weed removal',
    status: 'Pending',
    assignedTeam: 'Team Beta',
    siteId: '3',
  },
  {
    id: '6',
    title: 'Turf seeding',
    status: 'Pending',
    assignedTeam: 'Team Alpha',
    siteId: '3',
  },
  {
    id: '7',
    title: 'Pest control treatment',
    status: 'In Progress',
    assignedTeam: 'Team Delta',
    siteId: '4',
  },
  {
    id: '8',
    title: 'Edge trimming',
    status: 'Completed',
    assignedTeam: 'Team Beta',
    siteId: '5',
  },
  {
    id: '9',
    title: 'Soil aeration',
    status: 'Pending',
    assignedTeam: 'Team Gamma',
    siteId: '6',
  },
  {
    id: '10',
    title: 'Drainage inspection',
    status: 'Pending',
    assignedTeam: 'Team Delta',
    siteId: '6',
  },
];

// Mock dashboard stats
export const mockDashboardStats: DashboardStats = {
  totalSites: mockSites.length,
  activeSites: mockSites.filter((site) => site.status === 'In Progress').length,
  pendingTasks: mockTasks.filter((task) => task.status === 'Pending').length,
  teamsAvailable: 4,
};

// Helper function to get site by ID
export const getSiteById = (id: string): Site | undefined => {
  return mockSites.find((site) => site.id === id);
};

// Helper function to get tasks by site ID
export const getTasksBySiteId = (siteId: string): Task[] => {
  return mockTasks.filter((task) => task.siteId === siteId);
};
