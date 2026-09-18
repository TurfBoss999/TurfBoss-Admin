import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleApiError } from '@/lib/requireAdmin';
import { ApiResponse } from '@/types/database';

interface GeocodeResult {
  lat: number | null;
  lng: number | null;
}

// POST /api/admin/geocode - Server-side geocoding for the job/property
// creation flow. The Google API key must never reach the browser, so this
// always runs here rather than being called directly from client code.
export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<GeocodeResult>>> {
  try {
    await requireAdmin();

    const { address } = await request.json();

    if (!address || typeof address !== 'string' || !address.trim()) {
      return NextResponse.json(
        { success: false, error: 'address is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GOOGLE_GEOCODING_API_KEY;

    if (!apiKey) {
      console.error('GOOGLE_GEOCODING_API_KEY is not configured');
      return NextResponse.json({ success: true, data: { lat: null, lng: null } });
    }

    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      address.trim()
    )}&key=${apiKey}`;

    const geocodeResponse = await fetch(url);
    const geocodeJson = await geocodeResponse.json();

    // A failed geocode is logged and skipped rather than blocking the
    // caller, matching how the original backfill script handled failures.
    if (geocodeJson.status !== 'OK' || !geocodeJson.results?.[0]) {
      console.error('Geocoding failed for address:', address, geocodeJson.status);
      return NextResponse.json({ success: true, data: { lat: null, lng: null } });
    }

    const { lat, lng } = geocodeJson.results[0].geometry.location;
    return NextResponse.json({ success: true, data: { lat, lng } });
  } catch (error) {
    const { message, status } = handleApiError(error);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
