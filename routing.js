/**
 * Walking directions for the Intramuros guide.
 *
 * Routing comes from the FOSSGIS OSRM pedestrian instance — the same public service
 * openstreetmap.org uses for its own directions. It needs no API key and sends
 * `Access-Control-Allow-Origin: *`, so it works from a static GitHub Pages site with
 * nothing secret in the client.
 *
 *   https://routing.openstreetmap.de/routed-foot/
 *
 * OSRM returns maneuver OBJECTS, not sentences. The usual companion library
 * (osrm-text-instructions) is not published on any CDN, so `describe()` below renders
 * the text itself. That is viable because the maneuver vocabulary here is small and
 * closed — measured across six real Intramuros routes:
 *
 *   turn/left, turn/right, turn/slight left, depart, arrive, arrive/straight,
 *   arrive/left, end of road/left, end of road/right, fork/slight right
 *
 * Many Intramuros footways are unnamed, so every instruction degrades gracefully to a
 * bare "Turn left" rather than inventing a street name.
 *
 * Exposes one global, `Routing`.
 */
const Routing = (function () {
  'use strict';

  const ENDPOINT = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot/';
  const TIMEOUT_MS = 12000;

  /* ─────────────────────────── instruction text ──────────────────────────── */

  const TURNS = {
    'left':         'Turn left',
    'right':        'Turn right',
    'slight left':  'Bear left',
    'slight right': 'Bear right',
    'sharp left':   'Turn sharply left',
    'sharp right':  'Turn sharply right',
    'straight':     'Continue straight',
    'uturn':        'Turn around'
  };

  const COMPASS = ['north', 'north-east', 'east', 'south-east',
                   'south', 'south-west', 'west', 'north-west'];

  const heading = deg => COMPASS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];

  /** "onto Cabildo Street" — or nothing at all when OSM has no name for the way. */
  const onto = (name, word = 'onto') => (name ? ` ${word} ${name}` : '');

  /**
   * Turn one OSRM step into a sentence a visitor can follow.
   * `destination` is used only for the final arrival line.
   */
  function describe(step, destination) {
    const m = step.maneuver || {};
    const mod = m.modifier;
    const name = (step.name || '').trim();

    switch (m.type) {
      case 'depart':
        return `Head ${heading(m.bearing_after)}${onto(name, 'on')}`;

      case 'arrive': {
        const side = mod === 'left' ? ', on your left'
                   : mod === 'right' ? ', on your right'
                   : '';
        return `Arrive at ${destination}${side}`;
      }

      case 'turn':
        return `${TURNS[mod] || 'Turn'}${onto(name)}`;

      case 'end of road':
        return `At the end of the road, ${(TURNS[mod] || 'turn').toLowerCase()}${onto(name)}`;

      case 'fork':
        return `${mod && mod.includes('left') ? 'Keep left' : 'Keep right'} at the fork${onto(name)}`;

      case 'new name':
        return `Continue${onto(name)}`;

      case 'continue':
        return `${TURNS[mod] || 'Continue'}${onto(name, 'on')}`;

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
        return `${TURNS[mod] || 'Continue'}${onto(name)}`;
    }
  }

  /** Arrow glyph key for each maneuver, so the itinerary reads at a glance. */
  function arrowFor(step) {
    const m = step.maneuver || {};
    if (m.type === 'depart') return 'start';
    if (m.type === 'arrive') return 'flag';
    const mod = m.modifier || '';
    if (mod.includes('left')) return 'left';
    if (mod.includes('right')) return 'right';
    return 'straight';
  }

  /* ──────────────────────────────── request ─────────────────────────────── */

  /**
   * Route on foot between two {lat, lng} points.
   *
   * Always resolves — never rejects. On any failure it returns
   * `{ ok: false, fallback: true, ... }` carrying a straight-line estimate, so the
   * caller can degrade instead of showing an error.
   *
   * @param {{lat:number,lng:number}} from
   * @param {{lat:number,lng:number}} to
   * @param {string} destinationName  used in the arrival instruction
   */
  async function route(from, to, destinationName) {
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
      const steps = r.legs[0].steps;

      return {
        ok: true,
        fallback: false,
        distance: r.distance,                 // metres
        duration: r.duration,                 // seconds, OSRM's walking estimate
        // GeoJSON is [lng, lat]; Leaflet wants [lat, lng].
        line: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
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
  function straightLineFallback(from, to, destinationName, err) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (to.lat - from.lat) * rad, dLng = (to.lng - from.lng) * rad;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(from.lat * rad) * Math.cos(to.lat * rad) * Math.sin(dLng / 2) ** 2;
    const metres = 2 * R * Math.asin(Math.sqrt(a));

    return {
      ok: false,
      fallback: true,
      reason: (err && err.name === 'AbortError') ? 'timeout' : 'unavailable',
      distance: metres,
      duration: (metres / 80) * 60,       // 80 m/min, same pace used elsewhere
      line: [[from.lat, from.lng], [to.lat, to.lng]],
      steps: [{
        text: `Head towards ${destinationName}`,
        arrow: 'straight',
        distance: metres,
        name: '',
        last: true
      }],
      /* A link out, so the user is never stuck. */
      externalUrl: 'https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot' +
        `&route=${from.lat}%2C${from.lng}%3B${to.lat}%2C${to.lng}`
    };
  }

  return { route, describe, arrowFor };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Routing };
}
