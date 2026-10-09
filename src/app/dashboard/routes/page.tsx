'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import { AssignRouteResult, Crew, JobStatus } from '@/types/database';
import { formatVisitDate, todayLocalISO, visitStatus } from '@/lib/jobVisits';
import { planRoutes, reorderGroup } from '@/lib/routing';
import type { LatLng, RouteGroup, RouteOptions, Stop } from '@/lib/routing';

const supabase = getSupabaseBrowserClient();

// One Job (property visit) on the chosen date, with just what planning needs
interface PlanVisit {
  id: string;
  date: string;
  property: { id: string; address: string; lat: number | null; lng: number | null } | null;
  crews: { crew_id: string }[];
  jobs: { id: string; status: JobStatus | null }[];
}

interface Plan {
  groups: RouteGroup[];
  stops: Map<string, Stop>;
  options: RouteOptions;
}

const miles = (m: number) => m.toFixed(1);
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

export default function RoutesPage() {
  const [date, setDate] = useState(todayLocalISO());
  const [groupCountText, setGroupCountText] = useState('1');
  const [startAddress, setStartAddress] = useState('');
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [replaceCrews, setReplaceCrews] = useState(false);

  const [visits, setVisits] = useState<PlanVisit[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [plan, setPlan] = useState<Plan | null>(null);
  const [groupCrew, setGroupCrew] = useState<string[]>([]);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [result, setResult] = useState<AssignRouteResult | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  // The group count follows the number of active crews until the person types their own
  const groupCountTouched = useRef(false);

  // "Create Jobs for a date" links here with ?date=YYYY-MM-DD so the planner opens on that day. Read from
  // the address bar after mount rather than with useSearchParams, which would need a Suspense boundary.
  useEffect(() => {
    const fromLink = new URLSearchParams(window.location.search).get('date');
    if (fromLink && /^\d{4}-\d{2}-\d{2}$/.test(fromLink)) setDate(fromLink);
  }, []);

  // Active crews, in a stable order (by name)
  const activeCrews = useMemo(
    () => crews.filter((c) => c.is_active).sort((a, b) => a.name.localeCompare(b.name)),
    [crews]
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const [visitRes, crewRes] = await Promise.all([
          supabase
            .from('job_visits')
            .select(
              'id, date, property:properties(id, address, lat, lng), crews:job_visit_crews(crew_id), jobs(id, status)'
            )
            .eq('date', date),
          supabase.from('crews').select('*').order('name', { ascending: true }),
        ]);
        if (visitRes.error) throw visitRes.error;
        if (crewRes.error) throw crewRes.error;
        if (cancelled) return;
        setVisits((visitRes.data ?? []) as unknown as PlanVisit[]);
        setCrews((crewRes.data ?? []) as Crew[]);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load Jobs');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [date, reloadKey]);

  useEffect(() => {
    if (!groupCountTouched.current && crews.length > 0) {
      setGroupCountText(String(Math.max(1, activeCrews.length)));
    }
  }, [crews, activeCrews.length]);

  // Which Jobs can be routed. Completed and cancelled Jobs are never offered.
  const eligible = useMemo(
    () =>
      visits.filter((v) => {
        const status = visitStatus(v.jobs.map((j) => ({ status: j.status ?? 'scheduled' })));
        return status !== 'completed' && status !== 'cancelled';
      }),
    [visits]
  );
  const offered = useMemo(
    () => (onlyUnassigned ? eligible.filter((v) => v.crews.length === 0) : eligible),
    [eligible, onlyUnassigned]
  );
  const hasLocation = (v: PlanVisit) =>
    v.property != null && typeof v.property.lat === 'number' && typeof v.property.lng === 'number';
  const routable = offered.filter(hasLocation);
  const needsLocation = offered.filter((v) => !hasLocation(v));
  const skippedCount = visits.length - eligible.length;
  const visitsById = useMemo(() => new Map(visits.map((v) => [v.id, v])), [visits]);

  function resetResults() {
    setPlan(null);
    setPlanError(null);
    setSaveError(null);
    setResult(null);
  }

  async function geocodeStart(address: string): Promise<LatLng | null> {
    try {
      const response = await fetch('/api/admin/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });
      const json = await response.json();
      if (json.success && typeof json.data?.lat === 'number' && typeof json.data?.lng === 'number') {
        return { lat: json.data.lat, lng: json.data.lng };
      }
    } catch {
      // handled by the caller
    }
    return null;
  }

  async function handlePlan() {
    setPlanning(true);
    resetResults();
    try {
      const requested = Math.floor(Number(groupCountText));
      if (!Number.isFinite(requested) || requested < 1) {
        setPlanError('Enter a group count of 1 or more.');
        return;
      }
      if (routable.length === 0) {
        setPlanError('There are no Jobs with a location to plan on that date.');
        return;
      }
      const options: RouteOptions = {};
      if (startAddress.trim()) {
        const start = await geocodeStart(startAddress.trim());
        if (!start) {
          setPlanError(
            "Couldn't find that start address. Check it, or clear it to plan without a start point."
          );
          return;
        }
        options.startPoint = start;
      }
      const stops = new Map<string, Stop>();
      for (const v of routable) {
        stops.set(v.id, { id: v.id, lat: Number(v.property!.lat), lng: Number(v.property!.lng), weight: 1 });
      }
      const groups = planRoutes(Array.from(stops.values()), requested, options);
      setPlan({ groups, stops, options });
      // Pre-fill crews in a stable order; the person can change any of them
      setGroupCrew(groups.map((_, i) => activeCrews[i]?.id ?? ''));
    } finally {
      setPlanning(false);
    }
  }

  function moveStop(visitId: string, fromIndex: number, toIndex: number) {
    if (!plan || fromIndex === toIndex) return;
    const from = plan.groups[fromIndex];
    const to = plan.groups[toIndex];
    const fromStops = from.ids.filter((id) => id !== visitId).map((id) => plan.stops.get(id)!);
    const toStops = [...to.ids, visitId].map((id) => plan.stops.get(id)!);
    const groups = plan.groups.slice();
    groups[fromIndex] = reorderGroup(from.index, fromStops, plan.options);
    groups[toIndex] = reorderGroup(to.index, toStops, plan.options);
    setPlan({ ...plan, groups });
    setResult(null);
    setSaveError(null);
  }

  function setCrewFor(index: number, crewId: string) {
    setGroupCrew((prev) => prev.map((c, i) => (i === index ? crewId : c)));
    setResult(null);
    setSaveError(null);
  }

  // Groups that will be saved: they have stops and a crew
  const saveable = plan
    ? plan.groups
        .map((g, i) => ({ group: g, crewId: groupCrew[i] ?? '' }))
        .filter((x) => x.group.ids.length > 0 && x.crewId)
    : [];
  const unsavedGroups = plan
    ? plan.groups.filter((g, i) => g.ids.length > 0 && !(groupCrew[i] ?? '')).length
    : 0;
  const saveJobCount = saveable.reduce((n, x) => n + x.group.ids.length, 0);
  const alreadyHaveCrews = saveable.reduce(
    (n, x) => n + x.group.ids.filter((id) => (visitsById.get(id)?.crews.length ?? 0) > 0).length,
    0
  );

  async function handleAssign() {
    if (!plan || saveable.length === 0 || saving) return;
    setSaving(true);
    setSaveError(null);
    setResult(null);
    try {
      const payload = saveable.map((x) => ({ crew_id: x.crewId, visit_ids: x.group.ids }));
      const { data, error: rpcError } = await supabase.rpc('assign_route_groups', {
        p_assignments: payload,
        p_replace: replaceCrews,
      });
      if (rpcError) throw rpcError;
      setResult(data as AssignRouteResult);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save the route plan');
    } finally {
      setSaving(false);
    }
  }

  const crewName = (id: string) => crews.find((c) => c.id === id)?.name ?? 'Unknown crew';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Routes</h1>
        <p className="text-sm text-gray-500">
          Split a day&apos;s Jobs into groups that are close together, one group per truck, and put the
          stops in order. Distances are straight line, not drive time.
        </p>
      </div>

      {/* Controls */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm font-medium text-gray-700">
            Date
            <input
              type="date"
              value={date}
              onChange={(e) => {
                if (!e.target.value) return;
                setDate(e.target.value);
                resetResults();
              }}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Groups (one per truck)
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={groupCountText}
              onChange={(e) => {
                groupCountTouched.current = true;
                setGroupCountText(e.target.value);
                resetResults();
              }}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            <span className="mt-1 block text-xs font-normal text-gray-500">
              Starts at the number of active crews ({activeCrews.length}). Change it if you like.
            </span>
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Start address (optional)
            <input
              type="text"
              value={startAddress}
              onChange={(e) => {
                setStartAddress(e.target.value);
                resetResults();
              }}
              placeholder="Where the trucks leave from"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={onlyUnassigned}
            onChange={(e) => {
              setOnlyUnassigned(e.target.checked);
              resetResults();
            }}
            className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
          />
          Only Jobs with no crew yet
        </label>

        {loading ? (
          <p className="text-sm text-gray-500">Loading Jobs for {formatVisitDate(date)}…</p>
        ) : error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : (
          <p className="text-sm text-gray-700" data-testid="route-summary">
            <b>{plural(routable.length, 'Job')}</b> on {formatVisitDate(date)} can be planned
            {needsLocation.length > 0 && <>, {needsLocation.length} need a location</>}
            {skippedCount > 0 && <>, {skippedCount} completed or cancelled {skippedCount === 1 ? 'is' : 'are'} left out</>}
            {!onlyUnassigned && routable.filter((v) => v.crews.length > 0).length > 0 && (
              <>. {routable.filter((v) => v.crews.length > 0).length} already {routable.filter((v) => v.crews.length > 0).length === 1 ? 'has' : 'have'} a crew</>
            )}
            .
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handlePlan}
            disabled={loading || planning || routable.length === 0}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {planning ? 'Planning…' : 'Plan routes'}
          </button>
          {planError && <p className="text-sm text-red-700">{planError}</p>}
        </div>
      </div>

      {/* Needs location */}
      {!loading && needsLocation.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4" data-testid="needs-location">
          <h2 className="text-sm font-semibold text-amber-900">
            Needs location ({needsLocation.length})
          </h2>
          <p className="mt-1 text-sm text-amber-800">
            These Jobs have no map location, so they are not in any group. Fix the location, then plan again.
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {needsLocation.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-gray-900">{v.property?.address ?? 'Unknown property'}</span>
                {v.property && (
                  <Link
                    href={`/dashboard/properties/${v.property.id}`}
                    className="font-medium text-green-700 hover:text-green-800"
                  >
                    Fix location
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Plan */}
      {plan && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-700" data-testid="plan-summary">
            <span>
              <b>{plural(plan.groups.length, 'group')}</b>, {plural(routable.length, 'stop')}
            </span>
            <span>
              Total {miles(plan.groups.reduce((s, g) => s + g.totalMiles, 0))} mi (straight line)
            </span>
            {plan.options.startPoint && <span>Order starts from your start address</span>}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {plan.groups.map((group, gi) => {
              const takenElsewhere = new Set(groupCrew.filter((c, i) => i !== gi && c));
              return (
                <section key={gi} className="rounded-xl border border-gray-200 bg-white" aria-label={`Group ${gi + 1}`}>
                  <header className="border-b border-gray-100 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="text-base font-semibold text-gray-900">Group {gi + 1}</h3>
                        <p className="text-xs text-gray-500">
                          {plural(group.ids.length, 'stop')} · {miles(group.totalMiles)} mi total (straight line) ·
                          farthest stop {miles(group.farthestFromCenterMiles)} mi from the group&apos;s center
                        </p>
                      </div>
                      <label className="text-xs font-medium text-gray-600">
                        Crew
                        <select
                          value={groupCrew[gi] ?? ''}
                          onChange={(e) => setCrewFor(gi, e.target.value)}
                          className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                        >
                          <option value="">No crew (not saved)</option>
                          {activeCrews.map((c) => (
                            <option key={c.id} value={c.id} disabled={takenElsewhere.has(c.id)}>
                              {c.name}
                              {c.truck_number ? ` (Truck ${c.truck_number})` : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </header>
                  {group.ids.length === 0 ? (
                    <p className="p-4 text-sm text-gray-500">No stops in this group.</p>
                  ) : (
                    <ol className="divide-y divide-gray-100">
                      {group.ids.map((id, k) => {
                        const v = visitsById.get(id);
                        const services = v ? v.jobs.filter((j) => j.status !== 'cancelled').length : 0;
                        const leg = group.legMiles[k];
                        return (
                          <li key={id} className="flex flex-wrap items-center justify-between gap-2 p-3 sm:px-4" data-testid="stop">
                            <div className="flex min-w-0 items-start gap-3">
                              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-semibold text-green-800">
                                {k + 1}
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-gray-900">
                                  {v?.property?.address ?? 'Unknown property'}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {plural(services, 'service')}
                                  {leg !== null && leg !== undefined && (
                                    <> · {miles(leg)} mi {k === 0 ? 'from start' : 'from previous stop'} (straight line)</>
                                  )}
                                  {v && v.crews.length > 0 && (
                                    <> · already has {plural(v.crews.length, 'crew')}</>
                                  )}
                                </p>
                              </div>
                            </div>
                            {plan.groups.length > 1 && (
                              <select
                                aria-label={`Move ${v?.property?.address ?? 'stop'} to another group`}
                                value=""
                                onChange={(e) => {
                                  if (e.target.value !== '') moveStop(id, gi, Number(e.target.value));
                                }}
                                className="rounded-lg border border-gray-300 px-2 py-1 text-xs focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                              >
                                <option value="">Move to…</option>
                                {plan.groups.map((_, ti) =>
                                  ti === gi ? null : (
                                    <option key={ti} value={ti}>
                                      Group {ti + 1}
                                    </option>
                                  )
                                )}
                              </select>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </section>
              );
            })}
          </div>

          {/* Assign */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 space-y-3">
            <h2 className="text-base font-semibold text-gray-900">Save this plan</h2>
            <p className="text-sm text-gray-600">
              Assigning puts each group&apos;s crew on its Jobs and saves the stop numbers, which the crew sees
              in their app. Nothing is saved until you press Assign.
            </p>
            {alreadyHaveCrews > 0 && result === null && (
              <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="existing-crews-note">
                {plural(alreadyHaveCrews, 'of these Job')} already {alreadyHaveCrews === 1 ? 'has' : 'have'} a crew.
                {replaceCrews
                  ? ' They will be removed from those Jobs, except a crew that already started work on one.'
                  : ' The new crew is added and the existing crew stays, so the Job is shared.'}
              </p>
            )}
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={replaceCrews}
                onChange={(e) => setReplaceCrews(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span>Replace the crews already on these Jobs (off by default)</span>
            </label>
            {unsavedGroups > 0 && (
              <p className="text-sm text-amber-800">
                {plural(unsavedGroups, 'group')} with no crew will not be saved.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleAssign}
                disabled={saving || saveable.length === 0 || result !== null}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving
                  ? 'Saving…'
                  : saveable.length === 0
                  ? 'Choose a crew for a group'
                  : `Assign ${plural(saveJobCount, 'Job')} to ${plural(saveable.length, 'crew')}`}
              </button>
              {saveError && <p className="text-sm text-red-700">{saveError}</p>}
            </div>
            {result && (
              <div className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900" data-testid="assign-result">
                Saved. {plural(result.jobs, 'Job')} in {plural(result.groups, 'group')} now{' '}
                {result.jobs === 1 ? 'has' : 'have'} stop numbers. {plural(result.crew_assignments_added, 'crew assignment')} added
                {result.crew_assignments_removed > 0 && <>, {result.crew_assignments_removed} removed</>}
                {result.crews_kept_because_started > 0 && (
                  <>, {result.crews_kept_because_started} kept because that crew had already started work</>
                )}
                . Crews: {saveable.map((x) => crewName(x.crewId)).join(', ')}.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
