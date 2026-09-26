/**
 * Standalone landmarks highlighted on the map.
 *
 * These are NOT part of the Eat / See / Stay datasets: each renders as a
 * highlighted marker that sits above the clustered pins and is never touched by
 * the tab switch or the filters. Clicking one flies the map in to that location,
 * and its popup offers the same "Get directions" as any listed spot
 * (src/data/destinations.ts resolves it), so a visitor can be walked to the
 * exact building their session is in.
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
/** @type {import('./types').Landmark[]} */
export const LANDMARKS = [
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
     GA TOP …) are named in the blurb, not given their own markers. Room names
     follow the committee's knowledge base (data/mirc-2026.json, venue.buildings);
     "TOP" is still unexpanded there — see DATA.md §8. */
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
    blurb: 'Katipunan Building on the PLM campus (Filipino: Gusaling Katipunan). MIRC 2026 sessions run in its BTB hall (Bukod Tanging Bulwagan), which is not separately pinned. Coordinate from a visitor-supplied Google Maps pin ("Gusaling Katipunan" on Google).'
  },
  {
    id: 'plm-gee',
    name: 'Gusaling Emilio Ejercito Sr. (GEE)',
    short: 'GEE',
    kind: 'PLM campus · building',
    lat: 14.586407, lng: 120.976898,
    campus: true,
    provisional: true,
    blurb: 'The Emilio Ejercito Sr. Building on the PLM campus — houses the KL (Katipunan Lounge) and the AVR used for MIRC 2026 sessions, plus the lobby and first floor the programme names; a visitor confirmed the rooms are at this one location. "AVR" is taken to mean Audio-Visual Room.'
  },
  {
    id: 'plm-ga',
    name: 'Gusaling Don Pepe Atienza (GA)',
    short: 'GA',
    kind: 'PLM campus · building',
    lat: 14.586260, lng: 120.976835,
    campus: true,
    provisional: true,
    blurb: 'Don Pepe Atienza Building on the PLM campus, Muralla Street side — home of the College / Mass Communication Office, where MIRC 2026 sessions are held. Rooms inside it (e.g. "TOP") are not separately pinned. Coordinate refined 2026-09-09 to a visitor Google Maps pin on the Mass Communication Office.'
  },

  /* ── PLM campus — other buildings (not MIRC 2026 session venues) ─────────────
     Named buildings inside the PLM boundary, each from its own OpenStreetMap
     feature (way/node centre via Overpass, 2026-09-24). No `short`: those codes
     are the programme's own (JAA, GK …) and these have none, so the marker shows
     `glyph` (an icons.ts GLYPHS key) instead, and they are listed in the PLM
     panel rather than as VenueBar chips. */
  {
    id: 'plm-medical',
    name: 'Medical Building',
    kind: 'PLM campus · building',
    lat: 14.587296, lng: 120.975939,
    osm: 'way/88328810',
    glyph: 'museum',
    campus: true,
    blurb: 'A building on the PLM campus. Not one of the four MIRC 2026 session buildings. Position from OpenStreetMap.'
  },
  {
    id: 'plm-gym',
    name: 'Rajah Sulayman Gymnasium',
    kind: 'PLM campus · gymnasium',
    lat: 14.586958, lng: 120.975596,
    osm: 'way/331770763',
    glyph: 'museum',
    campus: true,
    blurb: 'The campus gymnasium. Not one of the four MIRC 2026 session buildings. Position from OpenStreetMap.'
  },
  {
    id: 'plm-lacson',
    name: 'Arsenio Lacson Building',
    kind: 'PLM campus · building',
    lat: 14.586620, lng: 120.975834,
    osm: 'way/331770762',
    glyph: 'museum',
    campus: true,
    blurb: 'Also called Gusaling Arsenio Lacson (Arsenio Lacson Hall). Not one of the four MIRC 2026 session buildings. Position from OpenStreetMap.'
  },
  {
    id: 'plm-magsaysay',
    name: 'Ramon Magsaysay Entrepreneurial Center',
    kind: 'PLM campus · building',
    lat: 14.586260, lng: 120.975978,
    osm: 'way/331770759',
    glyph: 'museum',
    campus: true,
    blurb: 'A building on the PLM campus. Not one of the four MIRC 2026 session buildings. Position from OpenStreetMap.'
  },
  {
    id: 'plm-chapel',
    name: 'PLM Chapel',
    kind: 'PLM campus · chapel',
    lat: 14.586077, lng: 120.976295,
    osm: 'way/331770758',
    glyph: 'church',
    campus: true,
    blurb: 'The campus chapel. Not one of the four MIRC 2026 session buildings. Position from OpenStreetMap.'
  },
  {
    id: 'plm-pride-hall',
    name: 'Pride Hall',
    kind: 'PLM campus · building',
    lat: 14.586777, lng: 120.976588,
    osm: 'way/267200103',
    glyph: 'museum',
    campus: true,
    blurb: 'A building on the PLM campus. Not one of the four MIRC 2026 session buildings. Position from OpenStreetMap.'
  },
  {
    id: 'plm-villegas',
    name: 'Antonio de Jesus Villegas Building',
    kind: 'PLM campus · building',
    // Where OSM labels it, on the General Luna Street wing. The footprint is an
    // L wrapped around the Activity Center, so its bbox centre lands on that.
    lat: 14.587059, lng: 120.976995,
    osm: 'way/88328809',
    glyph: 'museum',
    campus: true,
    blurb: 'Also called Gusaling Villegas. Not one of the four MIRC 2026 session buildings. Position from OpenStreetMap.'
  },
  {
    id: 'plm-uac',
    name: 'University Activity Center',
    kind: 'PLM campus · building',
    lat: 14.586751, lng: 120.976896,
    osm: 'way/267200093',
    glyph: 'museum',
    campus: true,
    blurb: 'A building on the PLM campus. Not one of the four MIRC 2026 session buildings. Position from OpenStreetMap.'
  },
  {
    id: 'plm-rizal',
    name: 'Jose Rizal Monument',
    kind: 'PLM campus · monument',
    lat: 14.586617, lng: 120.977406,
    osm: 'node/3388716896',
    glyph: 'obelisk',
    campus: true,
    blurb: 'A memorial to José Rizal on the campus grounds. Not one of the four MIRC 2026 session buildings. Position from OpenStreetMap.'
  }
];
