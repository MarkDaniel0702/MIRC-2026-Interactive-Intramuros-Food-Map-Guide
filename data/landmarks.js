/**
 * Standalone landmarks highlighted on the map.
 *
 * These are NOT part of the Eat / See / Stay datasets: each renders as an
 * always-visible, highlighted marker that sits above the clustered pins and is
 * never touched by the tab switch or the filters. Clicking one flies the map in
 * to that location.
 *
 * Kept as an array so more campus / venue landmarks can be added later. Every
 * entry is boundary-checked by tools/verify-in-intramuros.mjs.
 *
 * Coordinates from OpenStreetMap. Data (c) OpenStreetMap contributors, ODbL.
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
    blurb: 'The University of the City of Manila, on General Luna Street in the southern quarter of the walled city — a full campus of colleges, gymnasiums and the PLM Chapel behind its own gate.'
  }
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LANDMARKS };
}
