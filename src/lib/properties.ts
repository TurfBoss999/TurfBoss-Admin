import type { SupabaseClient } from '@supabase/supabase-js';
import type { Property, ServiceType } from '@/types/database';

export function normalizeAddress(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

// ilike reads % and _ as wildcards and \ as its escape character. An address is plain
// text, so escape all three before using it as a pattern. Without this, an address with
// an underscore or a percent sign would match other addresses.
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

// Looks for an existing property with this address, ignoring case and extra spaces.
// Pass excludeId when editing, so a property never counts as a duplicate of itself.
export async function findPropertyByAddress(
  supabase: SupabaseClient,
  rawAddress: string,
  excludeId?: string
): Promise<Pick<Property, 'id' | 'address'> | null> {
  let query = supabase
    .from('properties')
    .select('id, address')
    .ilike('address', escapeLikePattern(normalizeAddress(rawAddress)));

  if (excludeId) query = query.neq('id', excludeId);

  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  return data as Pick<Property, 'id' | 'address'> | null;
}

// Geocodes server-side via /api/admin/geocode so the Google API key never
// reaches the browser. A failed geocode is logged server-side and treated
// as null coordinates rather than blocking the save.
export async function geocodeAddress(
  rawAddress: string
): Promise<{ lat: number | null; lng: number | null }> {
  try {
    const response = await fetch('/api/admin/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: rawAddress }),
    });
    const json = await response.json();
    if (json.success) return json.data;
  } catch {
    // The property is still saved, just without coordinates.
  }
  return { lat: null, lng: null };
}

export function cleanEmail(value: string): string {
  return value.trim().toLowerCase();
}

// A blank email is allowed. One that is filled in must at least contain an @.
export function emailProblem(value: string): string | null {
  const email = cleanEmail(value);
  if (!email) return null;
  return email.includes('@') ? null : 'The email address must include an @.';
}

export function needsLocation(property: Pick<Property, 'lat' | 'lng'>): boolean {
  return property.lat == null || property.lng == null;
}

// The public page a property's client can open to see where their service stands
export function statusLinkFor(propertyId: string): string {
  return `${window.location.origin}/status/${propertyId}`;
}

// Copies text to the clipboard. Returns false when the browser refuses (for example on an
// insecure page), so the caller can show the text instead.
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// The four services a property can have as defaults, in the order they are shown everywhere
export const ALL_SERVICE_TYPES: ServiceType[] = ['salt_lot', 'plow_lot', 'salt_walk', 'shovel_walks'];

export const SITE_MAP_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const SITE_MAP_MAX_BYTES = 10 * 1024 * 1024;

// Uploads a site map for a property and saves its address on the property. Storage only allows
// uploading a NEW file name (there is no overwrite or delete permission), so every upload,
// including a replacement, gets its own timestamped name. The old file stays in Storage.
// Returns the public address that was saved.
export async function uploadSiteMap(
  supabase: SupabaseClient,
  propertyId: string,
  file: File
): Promise<string> {
  if (!SITE_MAP_TYPES.includes(file.type)) {
    throw new Error('Choose a PNG, JPG or WEBP image.');
  }
  if (file.size > SITE_MAP_MAX_BYTES) {
    throw new Error('That image is larger than 10 MB. Choose a smaller one.');
  }

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const filePath = `properties/${propertyId}/overlay-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('job-images')
    .upload(filePath, file, { cacheControl: '3600', upsert: false });
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from('job-images').getPublicUrl(filePath);

  // Ask for the saved row back: row-level security skips a row it will not let you update
  // without raising an error, and no row back means nothing was saved.
  const { data: saved, error: updateError } = await supabase
    .from('properties')
    .update({ overlay_image_url: urlData.publicUrl, updated_at: new Date().toISOString() })
    .eq('id', propertyId)
    .select('id')
    .maybeSingle();
  if (updateError) throw updateError;
  if (!saved) {
    throw new Error('The image was uploaded but the property was not updated. You may not have permission, or it no longer exists.');
  }

  return urlData.publicUrl;
}
