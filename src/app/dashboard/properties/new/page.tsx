'use client';

import Link from 'next/link';
import PropertyForm from '@/components/PropertyForm';

export default function NewPropertyPage() {
  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center space-x-2 text-sm text-gray-500">
        <Link href="/dashboard/properties" className="hover:text-gray-700">Properties</Link>
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-gray-900">New property</span>
      </nav>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Add property</h1>
        <p className="mt-1 text-sm text-gray-500">
          Save a property and its client contact without creating a Job. The address is looked up
          on the map when you save.
        </p>
      </div>

      <div className="max-w-2xl rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <PropertyForm />
      </div>
    </div>
  );
}
