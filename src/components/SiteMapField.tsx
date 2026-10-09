'use client';

import { useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import { uploadSiteMap } from '@/lib/properties';

const supabase = getSupabaseBrowserClient();

interface SiteMapFieldProps {
  propertyId: string;
  // The saved site map address, or null when the property has none
  url: string | null;
  onChange: (url: string) => void;
}

// Shows a property's site map and lets an admin upload or replace it. The same map is shown to
// crews on every Job at this property.
export default function SiteMapField({ propertyId, url, onChange }: SiteMapFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError(null);
    setUploading(true);
    try {
      onChange(await uploadSiteMap(supabase, propertyId, file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload the site map');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Site map</h2>
        <label
          className={`cursor-pointer text-sm font-medium ${
            uploading ? 'text-gray-400' : 'text-green-600 hover:text-green-700'
          }`}
        >
          {uploading ? 'Uploading...' : url ? 'Replace site map' : 'Upload site map'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={uploading}
            onChange={handleFile}
            className="hidden"
          />
        </label>
      </div>

      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block overflow-hidden rounded-lg border border-gray-200"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Site map" className="max-h-80 w-full object-contain" />
        </a>
      ) : (
        <div className="flex aspect-video items-center justify-center rounded-lg border-2 border-dashed border-gray-200 text-sm text-gray-400">
          No site map yet
        </div>
      )}
      <p className="mt-2 text-xs text-gray-500">
        Crews see this map on every Job at this property. PNG, JPG or WEBP, up to 10 MB. Replacing it keeps
        the old file in storage.
      </p>

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
