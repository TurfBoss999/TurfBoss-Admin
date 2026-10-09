import { meanCenter, PlanePoint, projectToMiles } from './distance';
import { describeGroup, orderStops } from './order';
import { RouteGroup, RouteOptions, Stop } from './types';

const MAX_ITERATIONS = 25;

// Optimal assignment (Hungarian algorithm, O(n^3)). Square cost matrix; returns, for every row,
// the column it was given. Deterministic: same matrix, same answer.
function hungarian(cost: Float64Array[], n: number): number[] {
  const u = new Float64Array(n + 1);
  const v = new Float64Array(n + 1);
  const p = new Int32Array(n + 1);
  const way = new Int32Array(n + 1);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Float64Array(n + 1).fill(Infinity);
    const used = new Uint8Array(n + 1);
    do {
      used[j0] = 1;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }
  const rowToCol = new Array<number>(n);
  for (let j = 1; j <= n; j++) rowToCol[p[j] - 1] = j - 1;
  return rowToCol;
}

const sq = (a: PlanePoint, b: PlanePoint) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

// Deterministic farthest-point seeding: first seed is the point farthest from the overall center,
// each next seed is the point farthest from every seed so far. Ties go to the lower index.
function pickSeeds(points: PlanePoint[], k: number): PlanePoint[] {
  const n = points.length;
  const cx = points.reduce((s, p) => s + p.x, 0) / n;
  const cy = points.reduce((s, p) => s + p.y, 0) / n;
  const center = { x: cx, y: cy };
  const chosen: number[] = [];
  let first = 0;
  let firstD = -1;
  points.forEach((p, i) => {
    const d = sq(p, center);
    if (d > firstD + 1e-12) {
      firstD = d;
      first = i;
    }
  });
  chosen.push(first);
  const minD = points.map((p) => sq(p, points[first]));
  while (chosen.length < k) {
    let next = -1;
    let nextD = -1;
    minD.forEach((d, i) => {
      if (!chosen.includes(i) && d > nextD + 1e-12) {
        nextD = d;
        next = i;
      }
    });
    chosen.push(next);
    points.forEach((p, i) => {
      minD[i] = Math.min(minD[i], sq(p, points[next]));
    });
  }
  return chosen.map((i) => ({ ...points[i] }));
}

// Splits stops into k groups whose sizes differ by at most 1, as geographically tight as an
// equal-size k-means gets, then orders the stops inside each group.
//   * Deterministic: no randomness, ties broken by id.
//   * k is clamped to the number of stops; no stops gives no groups.
//   * Straight-line distance only.
export function planRoutes(stops: Stop[], groupCount: number, options: RouteOptions = {}): RouteGroup[] {
  const sorted = stops.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const n = sorted.length;
  if (n === 0) return [];
  const k = Math.max(1, Math.min(Math.floor(groupCount) || 1, n));

  const refLat = meanCenter(sorted).lat;
  const points = projectToMiles(sorted, refLat);
  const base = Math.floor(n / k);
  const extra = n % k;

  let centroids = pickSeeds(points, k);
  let assignment: number[] = new Array<number>(n).fill(-1);

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    // Which clusters get the larger size when n is not divisible by k: the ones with the most
    // points closest to them (ties: lower index).
    const nearestCount = new Array<number>(k).fill(0);
    for (const p of points) {
      let bestC = 0;
      let bestD = Infinity;
      centroids.forEach((c, ci) => {
        const d = sq(p, c);
        if (d < bestD - 1e-12) {
          bestD = d;
          bestC = ci;
        }
      });
      nearestCount[bestC] += 1;
    }
    const order = nearestCount.map((count, ci) => ({ count, ci })).sort((a, b) => b.count - a.count || a.ci - b.ci);
    const size = new Array<number>(k).fill(base);
    for (let e = 0; e < extra; e++) size[order[e].ci] += 1;

    // One slot per seat in each cluster; optimal assignment of points to slots.
    const slotCluster: number[] = [];
    size.forEach((s, ci) => {
      for (let t = 0; t < s; t++) slotCluster.push(ci);
    });
    const cost = points.map((p) => {
      const row = new Float64Array(n);
      for (let j = 0; j < n; j++) row[j] = sq(p, centroids[slotCluster[j]]);
      return row;
    });
    const rowToCol = hungarian(cost, n);
    const next = rowToCol.map((col) => slotCluster[col]);

    const unchanged = next.every((c, i) => c === assignment[i]);
    assignment = next;

    centroids = centroids.map((old, ci) => {
      const members = points.filter((_, i) => assignment[i] === ci);
      if (members.length === 0) return old;
      return {
        x: members.reduce((s, p) => s + p.x, 0) / members.length,
        y: members.reduce((s, p) => s + p.y, 0) / members.length,
      };
    });
    if (unchanged) break;
  }

  // Order the groups themselves west to east so the result does not depend on seed order, then
  // order the stops inside each.
  const members: Stop[][] = Array.from({ length: k }, () => []);
  sorted.forEach((s, i) => members[assignment[i]].push(s));
  const groups = members
    .map((m) => ({ m, c: meanCenter(m) }))
    .sort((a, b) => a.c.lng - b.c.lng || a.c.lat - b.c.lat);
  return groups.map((g, gi) => describeGroup(gi, orderStops(g.m, options), options));
}

// Re-orders one group after the admin moves a Job in or out of it.
export function reorderGroup(index: number, stops: Stop[], options: RouteOptions = {}): RouteGroup {
  return describeGroup(index, orderStops(stops, options), options);
}
