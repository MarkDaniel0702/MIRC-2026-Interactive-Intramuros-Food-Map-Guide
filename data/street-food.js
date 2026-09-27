/**
 * The street food area: the stretch of Victoria, Magallanes and Recoletos Streets
 * where unnamed street food stalls set up. Drawn on the map as one zone along those
 * streets, not a pin per stall -- the stalls have no names, fixed spots or published
 * prices, so nothing here describes any single one.
 *
 * Extent from the area the site owner drew on the map (2026-09-27), registered
 * against the map's own pins (20 of 20 matched within 1.4 px) and snapped to the
 * OpenStreetMap centrelines of the three streets (the drawing ran 0.5-2.4 m off them):
 *   · Victoria Street, from Cabildo Street north-east to by Savor & Kribs -- the
 *     drawing stops ~35 m short of Muralla Street, so this does too;
 *   · Magallanes Street, from Victoria Street to Recoletos Street;
 *   · Recoletos Street, from Magallanes Street to Cabildo Street.
 *
 * Shaped like a landmark (data/landmarks.js) so it shares the landmark popup, the
 * "Get directions" path and chat's map focus, plus the `lines` it is drawn from.
 * Checked by tools/verify-in-intramuros.mjs (pass 6).
 */
/** @type {import('./types').StreetFoodArea} */
export const STREET_FOOD = {
  id: 'street-food',
  name: 'Street food stalls',
  kind: 'Street food area',
  glyph: 'bowl',
  // Victoria Street x Magallanes Street, where the Magallanes stretch leaves
  // Victoria: the label, the popup and where directions lead.
  lat: 14.5888223, lng: 120.9776672,
  street: 'Victoria, Magallanes and Recoletos Streets',
  blurb: 'Unnamed street food stalls line Victoria Street (Cabildo Street to near Muralla Street), Magallanes Street (Victoria to Recoletos) and Recoletos Street (Magallanes to Cabildo). They have no names, fixed spots or listed prices here — walk the stretch and see what is set up.',
  lines: [
    // Victoria Street, Cabildo Street -> by Savor & Kribs
    [[14.5883807, 120.9771159], [14.5888223, 120.9776672], [14.5890719, 120.9779653], [14.5893180, 120.9782641], [14.5895158, 120.9785225], [14.5895352, 120.9785489], [14.5895438, 120.9785684]],
    // Magallanes Street, Victoria Street -> Recoletos Street
    [[14.5888223, 120.9776672], [14.5882432, 120.9782231]],
    // Recoletos Street, Magallanes Street -> Cabildo Street
    [[14.5882432, 120.9782231], [14.5877578, 120.9776784]]
  ]
};
