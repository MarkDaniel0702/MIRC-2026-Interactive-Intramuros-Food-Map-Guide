/**
 * Arrival points offered as a starting location for directions.
 *
 * Every coordinate comes from OpenStreetMap via Overpass, not from free-text
 * geocoding — a Nominatim search for "Rizal Park Manila" during research returned a
 * park in Las Piñas, 19 km away, which is exactly the class of error this avoids.
 *
 * The three transit points sit OUTSIDE the Intramuros boundary. That is deliberate and
 * is the one sanctioned exception to the project's inside-only rule: they are
 * navigation references for people arriving, never listed as destinations. Nothing
 * outside the walls appears in the Eat, See or Stay tabs.
 *
 * `outside: true` drives the "outside the walls" note in the picker.
 *
 * `venue: true` marks the one point that is not an arrival point at all: the MIRC
 * 2026 venue itself, offered so a delegate can be walked FROM the campus to lunch
 * or a sight. The directions panel shows it beside "My location" rather than
 * among the "arriving at…" chips, and the chat corpus leaves it out of its
 * arrival-points list. Its coordinate is the campus centre, the same point every
 * "N min walk" on the site is measured from (VENUE_ANCHOR in tourist-spots.js).
 */
/** @type {import('./types').StartPoint[]} */
export const START_POINTS = [
  {
    id: 'plm-venue-start',
    name: 'PLM (the venue)',
    note: 'Pamantasan ng Lungsod ng Maynila · walk from the campus',
    lat: 14.5868604, lng: 120.9764378,
    osm: 'way/27275574',
    outside: false,
    venue: true
  },
  {
    id: 'lrt-central-terminal',
    name: 'Central Terminal (LRT-1)',
    note: 'Nearest LRT station · 920 m out',
    lat: 14.592796, lng: 120.981620,
    osm: 'railway=station, Manila LRT',
    outside: true
  },
  {
    id: 'park-ride-lawton',
    name: 'Park & Ride Lawton',
    note: 'Jeepney and bus hub · 840 m out',
    lat: 14.593347, lng: 120.980758,
    osm: 'public_transport=station',
    outside: true
  },
  {
    id: 'escolta-ferry',
    name: 'Escolta Ferry Station',
    note: 'Pasig River Ferry · 670 m out',
    lat: 14.596442, lng: 120.977497,
    osm: 'Pasig River Ferry System',
    outside: true
  },
  {
    id: 'plaza-de-roma-start',
    name: 'Plaza de Roma',
    note: 'Centre of the walled city',
    lat: 14.592183, lng: 120.973083,
    osm: 'way/24159652',
    outside: false
  },
  {
    id: 'fort-santiago-gate-start',
    name: 'Fort Santiago gate',
    note: 'Northern entrance',
    lat: 14.594252, lng: 120.970362,
    osm: 'way/828670531',
    outside: false
  },
  {
    id: 'puerta-real-start',
    name: 'Puerta Real',
    note: 'Southern gate · common taxi drop-off',
    lat: 14.586164, lng: 120.977048,
    osm: 'way/828320208',
    outside: false
  }
];
