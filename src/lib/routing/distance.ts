import { LatLng } from './types';

const EARTH_RADIUS_MILES = 3958.7613;

const toRad = (deg: number) => (deg * Math.PI) / 180;

// Straight-line (great-circle) distance in miles. Not drive time.
export function haversineMiles(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface PlanePoint {
  x: number;
  y: number;
}

// Local flat projection in miles around a reference latitude. Good enough over a metro area, and
// it makes "average of the points" a real centroid for the clustering step.
export function projectToMiles(points: LatLng[], referenceLat: number): PlanePoint[] {
  const milesPerDegLat = (Math.PI / 180) * EARTH_RADIUS_MILES;
  const milesPerDegLng = milesPerDegLat * Math.cos(toRad(referenceLat));
  return points.map((p) => ({ x: p.lng * milesPerDegLng, y: p.lat * milesPerDegLat }));
}

export function meanCenter(points: LatLng[]): LatLng {
  if (points.length === 0) return { lat: 0, lng: 0 };
  let lat = 0;
  let lng = 0;
  for (const p of points) {
    lat += p.lat;
    lng += p.lng;
  }
  return { lat: lat / points.length, lng: lng / points.length };
}
