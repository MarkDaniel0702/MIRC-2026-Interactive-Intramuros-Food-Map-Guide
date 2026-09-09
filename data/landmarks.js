/**
 * Standalone landmarks highlighted on the map.
 *
 * These are NOT part of the Eat / See / Stay datasets: each renders as a
 * highlighted marker that sits above the clustered pins and is never touched by
 * the tab switch or the filters. Clicking one flies the map in to that location.
 *
 * Two kinds:
 *   · top-level landmark (no `campus` flag) — always visible (e.g. the PLM campus).
 *   · `campus: true` — a building or hall WITHIN a landmark. These sit within tens
 *     of metres of each other, so app.js only shows them once the map is zoomed in
 *     (past CAMPUS_MIN_ZOOM); clicking the parent landmark brings them in.
 *
 * Every entry is boundary-checked by tools/verify-in-intramuros.mjs.
 * Coordinates from OpenStreetMap and visitor-supplied Google Maps pins.
 */
const LANDMARKS = [
  {
    id: 'plm',
    name: 'Pamantasan ng Lungsod ng Maynila',
    short: 'PLM',
    kind: 'University',
    lat: 14.5868604, lng: 120.9764378,
    osm: 'way/27275574',
    url: 'https://www.plm.edu.ph/',
    blurb: 'The University of the City of Manila, on General Luna Street in the southern quarter of the walled city — a full campus of colleges, gymnasiums and the PLM Chapel behind its own gate. The MIRC 2026 venue; zoom in for its buildings and halls.'
  },

  /* ── PLM campus — MIRC 2026 session locations ────────────────────────────────
     Visitor-supplied Google Maps pins, boundary-checked. `campus: true` keeps
     them hidden until the map is zoomed in. Each `Gusaling ...` marker is a whole
     building; individual session rooms inside it (GEE AVR / GEE KL, GK BTB,
     GA TOP …) are named in the blurb, not given their own markers. Some room
     abbreviations are still unexpanded — see DATA.md §8. */
  {
    id: 'plm-jaa',
    name: 'Justo Albert Auditorium (JAA)',
    short: 'JAA',
    kind: 'PLM campus · auditorium',
    lat: 14.586453, lng: 120.975866,
    campus: true,
    blurb: 'Lecture and event auditorium on the PLM campus — a single venue, not a multi-room building. Coordinate from a visitor-supplied Google Maps pin.'
  },
  {
    id: 'plm-katipunan',
    name: 'Gusaling Katipunan (GK)',
    short: 'GK',
    kind: 'PLM campus · building',
    lat: 14.587515, lng: 120.976390,
    campus: true,
    provisional: true,
    blurb: 'Katipunan Building on the PLM campus (Filipino: Gusaling Katipunan). MIRC 2026 session rooms inside it — e.g. "BTB" — are not separately pinned. Coordinate from a visitor-supplied Google Maps pin ("Gusaling Katipunan" on Google).'
  },
  {
    id: 'plm-gee',
    name: 'Gusaling Emilio Ejercito Sr. (GEE)',
    short: 'GEE',
    kind: 'PLM campus · building',
    lat: 14.586407, lng: 120.976898,
    campus: true,
    provisional: true,
    blurb: 'The Emilio Ejercito Sr. Building on the PLM campus — houses the AVR and KL rooms used for MIRC 2026 sessions; a visitor confirmed both are at this one location. "AVR" is taken to mean Audio-Visual Room; "KL" is not yet expanded.'
  },
  {
    id: 'plm-ga',
    name: 'Gusaling Don Pepe Atienza (GA)',
    short: 'GA',
    kind: 'PLM campus · building',
    lat: 14.586262, lng: 120.976300,
    campus: true,
    provisional: true,
    blurb: 'Don Pepe Atienza Building on the PLM campus, Muralla Street side. MIRC 2026 session rooms inside it — e.g. "TOP" — are not separately pinned. Coordinate from a visitor-supplied Google Maps pin ("Gusaling Don Pepe Atienza" on Google).'
  }
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LANDMARKS };
}
