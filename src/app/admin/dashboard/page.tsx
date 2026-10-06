import { redirect } from 'next/navigation';

// The old flat "Jobs Management" table assigned a crew to each individual Sub Job,
// which no longer matches how work is assigned (crews belong to the Job). Its
// replacement is the Jobs list and the Job page under /dashboard.
export default function LegacyAdminDashboardRedirect() {
  redirect('/dashboard');
}
