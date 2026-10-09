// Route planning types. Pure data, no UI imports.

export interface LatLng {
  lat: number;
  lng: number;
}

// One stop = one Job (a property visit). Weight is 1 per Job in v1; balancing is by count today,
// and weight is carried through so balancing by estimated time is a small later change.
export interface Stop extends LatLng {
  id: string;
  weight: number;
}

export interface RouteOptions {
  // Where the truck starts. When set, each group's order starts from the stop nearest to it.
  startPoint?: LatLng;
}

export interface RouteGroup {
  index: number;
  // Stops in driving order (an open path, not a loop)
  ids: string[];
  // Straight-line miles from the previous stop. The first entry is the leg from the start
  // point when one was given, otherwise null.
  legMiles: (number | null)[];
  // Sum of the legs, including the start leg when there is one
  totalMiles: number;
  totalWeight: number;
  center: LatLng;
  // Straight-line miles from the group's center to its farthest stop
  farthestFromCenterMiles: number;
}
