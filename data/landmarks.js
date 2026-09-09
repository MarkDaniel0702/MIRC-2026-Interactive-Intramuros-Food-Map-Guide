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
     them hidden until the map is zoomed in. Two items are still provisional —
     see the blurbs and DATA.md §8. */
  {
    id: 'plm-jaa',
    name: 'Justo Albert Auditorium (JAA)',
    short: 'JAA',
    kind: 'PLM campus · auditorium',
    lat: 14.586453, lng: 120.975866,
    campus: true,
    blurb: 'Lecture and event auditorium on the PLM campus. Coordinate from a visitor-supplied Google Maps pin.'
  },
  {
    id: 'plm-katipunan',
    name: 'Katipunan Building (Gusaling Katipunan)',
    short: 'KAT',
    kind: 'PLM campus · building',
    lat: 14.587515, lng: 120.976390,
    campus: true,
    blurb: 'Academic building on the PLM campus (Filipino: Gusaling Katipunan). Coordinate from a visitor-supplied Google Maps pin ("Gusaling Katipunan" on Google).'
  },
  {
    id: 'plm-gee-avr',
    name: 'Gusaling Emilio Ejercito Sr. — AVR',
    short: 'AVR',
    kind: 'PLM campus · Audio-Visual Room',
    lat: 14.587371, lng: 120.976091,
    campus: true,
    provisional: true,
    blurb: 'Audio-Visual Room in the Gusaling Emilio Ejercito Sr. (GEE) building, PLM campus. PROVISIONAL: "AVR" is assumed to mean Audio-Visual Room, and the AVR / KL split across the two GEE pins is not yet confirmed — the labels may need swapping.'
  },
  {
    id: 'plm-gee-kl',
    name: 'Gusaling Emilio Ejercito Sr. — KL',
    short: 'KL',
    kind: 'PLM campus · room',
    lat: 14.586407, lng: 120.976898,
    campus: true,
    provisional: true,
    blurb: 'A room in the Gusaling Emilio Ejercito Sr. (GEE) building, PLM campus. PROVISIONAL: "KL" has not been expanded, and the AVR / KL split across the two GEE pins is not yet confirmed — the labels may need swapping.'
  }
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LANDMARKS };
}
