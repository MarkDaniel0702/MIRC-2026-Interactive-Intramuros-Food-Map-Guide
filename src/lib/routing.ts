/**
 * Walking directions for the Intramuros guide.
 *
 * Routing comes from the FOSSGIS OSRM pedestrian instance -- the same public service
 * openstreetmap.org uses for its own directions. It needs no API key and sends
 * `Access-Control-Allow-Origin: *`, so it works from a static GitHub Pages site with
 * nothing secret in the client.
 *
 *   https://routing.openstreetmap.de/routed-foot/
 *
 * OSRM returns maneuver OBJECTS, not sentences. The usual companion library
 * (osrm-text-instructions) is not published on any CDN, so `describe()` below renders
 * the text itself. That is viable because the maneuver vocabulary here is small and
 * closed -- measured across six real Intramuros routes:
 *
 *   turn/left, turn/right, turn/slight left, depart, arrive, arrive/straight,
 *   arrive/left, end of road/left, end of road/right, fork/slight right
 *
 * Many Intramuros footways are unnamed, so every instruction degrades gracefully to a
 * bare "Turn left" rather than inventing a street name.
 *
 * Ported unchanged from routing.js -- pure async logic, no DOM dependencies.
 */
import type { LatLng } from '../types';
import { haversine } from './format';
import { PLM_PATHS } from '../../data/plm-paths.js';

const ENDPOINT = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot/';
const TIMEOUT_MS = 12000;

type Pt = [number, number];
const metres = (a: Pt, b: Pt) => haversine(a[0], a[1], b[0], b[1]);
const lengthOf = (line: Pt[]) => line.slice(1).reduce((sum, p, i) => sum + metres(line[i], p), 0);
const minutes = (m: number) => (m / 80) * 60; // 80 m/min, same pace used elsewhere

/**
 * The walk between General Luna Street and the start of the campus footpath, through
 * PLM's northern east-side gate (OSM node 11521214083, 0.4 m off this line). Street
 * end first, [lat, lng]. Traced from the route the site owner drew on the map
 * (2026-09-27), because OSRM cannot enter the gated campus: without this, a route
 * into or out of PLM just stopped at whichever street was nearest.
 */
const PLM_GATE: Pt[] = [
  [14.586809, 120.977449], [14.586801, 120.977420], [14.586783, 120.977416],
  [14.586771, 120.977406], [14.586741, 120.977391], [14.586726, 120.977376],
  [14.586720, 120.977359], [14.586690, 120.977330], [14.586663, 120.977317],
  [14.586654, 120.977308], [14.586650, 120.977283], [14.586671, 120.977237],
  [14.586679, 120.977207], [14.586677, 120.977195]
];
const PLM_GATE_METRES = lengthOf(PLM_GATE);
const GATE_INSIDE = PLM_GATE[PLM_GATE.length - 1];

/** Where a route meets the PLM campus: only the destination on it ('enter'), only the
 *  start ('exit'), or both ('within'). */
export type Campus = 'enter' | 'exit' | 'within';

/** The campus ways (data/plm-paths.js) as a network: each point, and the metres to
 *  each neighbour. Ways join wherever they share a point exactly. */
const NET = new Map<string, { p: Pt; next: Map<string, number> }>();
const key = (p: Pt) => `${p[0]},${p[1]}`;
for (const way of PLM_PATHS as Pt[][]) {
  way.forEach((p, i) => {
    if (!NET.has(key(p))) NET.set(key(p), { p, next: new Map() });
    if (i === 0) return;
    const q = way[i - 1], m = metres(p, q);
    NET.get(key(p))!.next.set(key(q), m);
    NET.get(key(q))!.next.set(key(p), m);
  });
}

/** The nearest point on any campus way to `p`, with the two ends of its segment. */
function snap(p: Pt): { at: Pt; a: string; b: string } {
  const kx = Math.cos((p[0] * Math.PI) / 180);
  let best = { d: Infinity, at: p, a: '', b: '' };
  for (const [a, { p: A, next }] of NET) {
    for (const b of next.keys()) {
      const B = NET.get(b)!.p;
      const dx = (B[1] - A[1]) * kx, dy = B[0] - A[0];
      const t = Math.max(0, Math.min(1, ((p[1] - A[1]) * kx * dx + (p[0] - A[0]) * dy) / (dx * dx + dy * dy || 1)));
      const at: Pt = [A[0] + t * dy, A[1] + t * (B[1] - A[1])];
      const d = metres(p, at);
      if (d < best.d) best = { d, at, a, b };
    }
  }
  return best;
}

/**
 * Walk between two on-campus points: straight onto the nearest campus way, the
 * shortest way through the network, then straight off to the point -- the last
 * stretch to a building is the only part not on a mapped way.
 */
export function campusWalk(from: Pt, to: Pt): Pt[] {
  const s = snap(from), e = snap(to);
  if ((s.a === e.a && s.b === e.b) || (s.a === e.b && s.b === e.a)) return [from, s.at, e.at, to];
  const dist = new Map([[s.a, metres(s.at, NET.get(s.a)!.p)], [s.b, metres(s.at, NET.get(s.b)!.p)]]);
  const prev = new Map<string, string>();
  const done = new Set<string>();
  // ponytail: Dijkstra with a linear scan, no heap -- the campus has ~60 points.
  for (;;) {
    let u = '';
    for (const [k, d] of dist) if (!done.has(k) && (!u || d < dist.get(u)!)) u = k;
    if (!u) break;
    done.add(u);
    for (const [v, m] of NET.get(u)!.next) {
      if (dist.get(u)! + m < (dist.get(v) ?? Infinity)) { dist.set(v, dist.get(u)! + m); prev.set(v, u); }
    }
  }
  const via = (k: string) => (dist.get(k) ?? Infinity) + metres(NET.get(k)!.p, e.at);
  const mid: Pt[] = [];
  for (let k: string | undefined = via(e.a) <= via(e.b) ? e.a : e.b; k; k = prev.get(k)) mid.unshift(NET.get(k)!.p);
  return [from, s.at, ...mid, e.at, to];
}

export interface RouteStep {
  text: string;
  arrow: string;
  distance: number;
  name: string;
  last: boolean;
}

export interface RouteResult {
  ok: boolean;
  fallback: boolean;
  reason?: 'timeout' | 'unavailable';
  distance: number;
  duration: number;
  line: [number, number][];
  steps: RouteStep[];
  externalUrl?: string;
  /** Set when part of the route runs on the PLM campus (see PLM_GATE, campusWalk). */
  campus?: Campus;
}

interface OsrmManeuver {
  type: string;
  modifier?: string;
  bearing_after?: number;
  exit?: number;
}

interface OsrmStep {
  maneuver?: OsrmManeuver;
  name?: string;
  distance: number;
}

const TURNS: Record<string, string> = {
  left: 'Turn left',
  right: 'Turn right',
  'slight left': 'Bear left',
  'slight right': 'Bear right',
  'sharp left': 'Turn sharply left',
  'sharp right': 'Turn sharply right',
  straight: 'Continue straight',
  uturn: 'Turn around'
};

const COMPASS = ['north', 'north-east', 'east', 'south-east',
  'south', 'south-west', 'west', 'north-west'];

const heading = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

/** "onto Cabildo Street" -- or nothing at all when OSM has no name for the way. */
const onto = (name: string, word = 'onto') => (name ? ` ${word} ${name}` : '');

/**
 * Turn one OSRM step into a sentence a visitor can follow.
 * `destination` is used only for the final arrival line.
 */
export function describe(step: OsrmStep, destination: string): string {
  const m = step.maneuver || ({} as OsrmManeuver);
  const mod = m.modifier;
  const name = (step.name || '').trim();

  switch (m.type) {
    case 'depart':
      return `Head ${heading(m.bearing_after ?? 0)}${onto(name, 'on')}`;

    case 'arrive': {
      const side = mod === 'left' ? ', on your left'
        : mod === 'right' ? ', on your right'
        : '';
      return `Arrive at ${destination}${side}`;
    }

    case 'turn':
      return `${(mod && TURNS[mod]) || 'Turn'}${onto(name)}`;

    case 'end of road':
      return `At the end of the road, ${((mod && TURNS[mod]) || 'turn').toLowerCase()}${onto(name)}`;

    case 'fork':
      return `${mod && mod.includes('left') ? 'Keep left' : 'Keep right'} at the fork${onto(name)}`;

    case 'new name':
      return `Continue${onto(name)}`;

    case 'continue':
      return `${(mod && TURNS[mod]) || 'Continue'}${onto(name, 'on')}`;

    case 'merge':
      return `Merge${onto(name)}`;

    case 'roundabout':
    case 'rotary':
      return m.exit
        ? `At the roundabout, take exit ${m.exit}${onto(name)}`
        : `Go around the roundabout${onto(name)}`;

    case 'notification':
      return `Continue${onto(name, 'on')}`;

    default:
      return `${(mod && TURNS[mod]) || 'Continue'}${onto(name)}`;
  }
}

/** Arrow glyph key for each maneuver, so the itinerary reads at a glance. */
export function arrowFor(step: OsrmStep): string {
  const m = step.maneuver || ({} as OsrmManeuver);
  if (m.type === 'depart') return 'start';
  if (m.type === 'arrive') return 'flag';
  const mod = m.modifier || '';
  if (mod.includes('left')) return 'left';
  if (mod.includes('right')) return 'right';
  return 'straight';
}

/**
 * Route on foot between two {lat, lng} points. With `campus`, the part on the PLM
 * campus runs through PLM_GATE and along the campus ways (campusWalk); OSRM only
 * routes the street leg, to or from the gate -- and nothing at all when both ends
 * are on campus.
 *
 * Always resolves -- never rejects. On any failure it returns
 * `{ ok: false, fallback: true, ... }` carrying a straight-line estimate, so the
 * caller can degrade instead of showing an error.
 */
export async function route(from: LatLng, to: LatLng, destinationName: string, campus?: Campus): Promise<RouteResult> {
  if (campus === 'within') {
    const line = campusWalk([from.lat, from.lng], [to.lat, to.lng]);
    const distance = lengthOf(line);
    return {
      ok: true, fallback: false, campus, distance, duration: minutes(distance), line,
      steps: [
        { text: `Follow the campus paths to ${destinationName}`, arrow: 'start', distance, name: '', last: false },
        { text: `Arrive at ${destinationName}`, arrow: 'flag', distance: 0, name: '', last: true }
      ]
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    if (!campus) return await osrm(from, to, destinationName, controller.signal);
    const street = { lat: PLM_GATE[0][0], lng: PLM_GATE[0][1] };
    const r = campus === 'enter'
      ? await osrm(from, street, destinationName, controller.signal)
      : await osrm(street, to, destinationName, controller.signal);
    return campus === 'enter'
      ? throughGate(r, campus, campusWalk(GATE_INSIDE, [to.lat, to.lng]), destinationName)
      : throughGate(r, campus, campusWalk([from.lat, from.lng], GATE_INSIDE), destinationName);
  } catch (err) {
    return straightLineFallback(from, to, destinationName, err);
  } finally {
    clearTimeout(timer);
  }
}

async function osrm(from: LatLng, to: LatLng, destinationName: string, signal: AbortSignal): Promise<RouteResult> {
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const url = `${ENDPOINT}${coords}?overview=full&geometries=geojson&steps=true&alternatives=false`;

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes || !data.routes.length) {
    throw new Error(data.code || 'no route');
  }

  const r = data.routes[0];
  const steps: OsrmStep[] = r.legs[0].steps;

  return {
    ok: true,
    fallback: false,
    distance: r.distance,
    duration: r.duration,
    // GeoJSON is [lng, lat]; Leaflet wants [lat, lng].
    line: r.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]),
    steps: steps.map((s, i) => ({
      text: describe(s, destinationName),
      arrow: arrowFor(s),
      distance: s.distance,
      name: (s.name || '').trim(),
      last: i === steps.length - 1
    }))
  };
}

/** Joins the gate and the campus walk (`inside`, which starts or ends at GATE_INSIDE)
 *  onto a street route that ends (enter) or starts (exit) at the gate. */
function throughGate(r: RouteResult, campus: 'enter' | 'exit', inside: Pt[], destinationName: string): RouteResult {
  const insideMetres = lengthOf(inside);
  const joined = {
    ...r,
    campus,
    distance: r.distance + PLM_GATE_METRES + insideMetres,
    duration: r.duration + minutes(PLM_GATE_METRES + insideMetres)
  };
  const step = (text: string, arrow: string, distance: number) => ({ text, arrow, distance, name: '', last: false });

  if (campus === 'enter') {
    return {
      ...joined,
      line: [...r.line, ...PLM_GATE, ...inside.slice(1)],
      // OSRM's own "Arrive" is at the street; the walk carries on through the gate.
      steps: [
        ...r.steps.slice(0, -1),
        step('Enter PLM through the gate on General Luna Street', 'straight', PLM_GATE_METRES),
        step(`Follow the campus paths to ${destinationName}`, 'straight', insideMetres),
        { text: `Arrive at ${destinationName}`, arrow: 'flag', distance: 0, name: '', last: true }
      ]
    };
  }
  return {
    ...joined,
    line: [...inside, ...[...PLM_GATE].reverse().slice(1), ...r.line],
    steps: [
      step('Follow the campus paths to the gate on General Luna Street', 'start', insideMetres),
      step('Leave PLM through the gate onto General Luna Street', 'straight', PLM_GATE_METRES),
      ...r.steps.map((s, i) => (i === 0 ? { ...s, arrow: 'straight' } : s))
    ]
  };
}

/**
 * Used when the routing service is unreachable, times out, or finds no path.
 * A straight line and an honest estimate beat an error message.
 */
function straightLineFallback(from: LatLng, to: LatLng, destinationName: string, err: unknown): RouteResult {
  const metres = haversine(from.lat, from.lng, to.lat, to.lng);

  return {
    ok: false,
    fallback: true,
    reason: err instanceof Error && err.name === 'AbortError' ? 'timeout' : 'unavailable',
    distance: metres,
    duration: (metres / 80) * 60, // 80 m/min, same pace used elsewhere
    line: [[from.lat, from.lng], [to.lat, to.lng]],
    steps: [{
      text: `Head towards ${destinationName}`,
      arrow: 'straight',
      distance: metres,
      name: '',
      last: true
    }],
    // A link out, so the user is never stuck.
    externalUrl: 'https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot' +
      `&route=${from.lat}%2C${from.lng}%3B${to.lat}%2C${to.lng}`
  };
}

/**
 * How far `point` sits from the route line, in metres -- nearest-VERTEX distance,
 * not a true point-to-segment projection. `line` is dense (OSRM's own geometry,
 * `overview=full`), so within an Intramuros-sized route the gap between a vertex
 * and the segment it sits on is a couple of metres at most, well inside the
 * threshold this is used against. Used to decide when a live walker has strayed
 * far enough off the plotted route to be worth a fresh one, not to steer anyone.
 */
export function distanceToLine(point: LatLng, line: [number, number][]): number {
  let min = Infinity;
  for (const [lat, lng] of line) {
    const d = haversine(point.lat, point.lng, lat, lng);
    if (d < min) min = d;
  }
  return min;
}
