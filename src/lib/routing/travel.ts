// Estimated drive time between stops. This is a guess from straight-line miles, not live traffic or a
// routing service, so it is always shown as "about N min". Change the two numbers below to tune it.

// Roads are longer than the straight line between two points
const ROAD_FACTOR = 1.3;
// Average speed over a mix of side streets and main roads, in miles per hour
const AVERAGE_MPH = 30;

// Whole minutes, never less than 1 (two stops next door still take a minute to get between)
export function estimateMinutes(straightLineMiles: number): number {
  const minutes = ((straightLineMiles * ROAD_FACTOR) / AVERAGE_MPH) * 60;
  return Math.max(1, Math.round(minutes));
}
