import { haversineMiles, meanCenter } from './distance';
import { LatLng, RouteGroup, RouteOptions, Stop } from './types';

const EPS = 1e-9;

// Orders a group's stops as an open path.
//   Start: the stop nearest the start point; with no start point, the stop farthest from the
//   group's center. Then nearest-neighbor, then 2-opt until nothing improves.
// Ties are broken by id, so the same input always gives the same order.
export function orderStops(stops: Stop[], options: RouteOptions = {}): Stop[] {
  const n = stops.length;
  if (n <= 1) return stops.slice();

  const sorted = stops.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const start = options.startPoint;
  const center = meanCenter(sorted);

  // Pick the first stop
  let first = 0;
  let best = start ? Infinity : -Infinity;
  sorted.forEach((s, i) => {
    const d = start ? haversineMiles(start, s) : haversineMiles(center, s);
    if (start ? d < best - EPS : d > best + EPS) {
      best = d;
      first = i;
    }
  });

  // Nearest neighbor
  const remaining = sorted.map((_, i) => i).filter((i) => i !== first);
  const path: number[] = [first];
  while (remaining.length > 0) {
    const last = sorted[path[path.length - 1]];
    let pick = 0;
    let pickD = Infinity;
    remaining.forEach((idx, r) => {
      const d = haversineMiles(last, sorted[idx]);
      if (d < pickD - EPS) {
        pickD = d;
        pick = r;
      }
    });
    path.push(remaining.splice(pick, 1)[0]);
  }

  // 2-opt on an open path. With a start point the start is a fixed node in front of the path (so
  // the leg from it counts); without one, either end of the path is free to move.
  const pointAt = (k: number): LatLng => sorted[path[k]];
  const dist = (a: LatLng, b: LatLng) => haversineMiles(a, b);
  let improved = true;
  let passes = 0;
  while (improved && passes < 1000) {
    improved = false;
    passes += 1;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        // Reversing path[i..j] swaps the edge into i and the edge out of j.
        const before = i > 0 ? pointAt(i - 1) : start;
        const after = j < n - 1 ? pointAt(j + 1) : null;
        let oldLen = 0;
        let newLen = 0;
        if (before) {
          oldLen += dist(before, pointAt(i));
          newLen += dist(before, pointAt(j));
        }
        if (after) {
          oldLen += dist(pointAt(j), after);
          newLen += dist(pointAt(i), after);
        }
        if (newLen < oldLen - EPS) {
          let lo = i;
          let hi = j;
          while (lo < hi) {
            const t = path[lo];
            path[lo] = path[hi];
            path[hi] = t;
            lo += 1;
            hi -= 1;
          }
          improved = true;
        }
      }
    }
  }

  return path.map((k) => sorted[k]);
}

// Builds the numbers shown on a group card from an already ordered list of stops.
export function describeGroup(index: number, ordered: Stop[], options: RouteOptions = {}): RouteGroup {
  const center = meanCenter(ordered);
  const legMiles: (number | null)[] = ordered.map((s, k) => {
    if (k === 0) return options.startPoint ? haversineMiles(options.startPoint, s) : null;
    return haversineMiles(ordered[k - 1], s);
  });
  const totalMiles = legMiles.reduce<number>((sum, m) => sum + (m ?? 0), 0);
  const farthest = ordered.reduce((m, s) => Math.max(m, haversineMiles(center, s)), 0);
  return {
    index,
    ids: ordered.map((s) => s.id),
    legMiles,
    totalMiles,
    totalWeight: ordered.reduce((sum, s) => sum + s.weight, 0),
    center,
    farthestFromCenterMiles: farthest,
  };
}
