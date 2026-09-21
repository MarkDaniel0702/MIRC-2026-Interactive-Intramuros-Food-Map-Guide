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

const ENDPOINT = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot/';
const TIMEOUT_MS = 12000;

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
 * Route on foot between two {lat, lng} points.
 *
 * Always resolves -- never rejects. On any failure it returns
 * `{ ok: false, fallback: true, ... }` carrying a straight-line estimate, so the
 * caller can degrade instead of showing an error.
 */
export async function route(from: LatLng, to: LatLng, destinationName: string): Promise<RouteResult> {
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const url = `${ENDPOINT}${coords}?overview=full&geometries=geojson&steps=true&alternatives=false`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
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
  } catch (err) {
    return straightLineFallback(from, to, destinationName, err);
  } finally {
    clearTimeout(timer);
  }
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
