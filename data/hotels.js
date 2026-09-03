/**
 * Accommodation inside Intramuros, Manila.
 *
 * Same discipline as data/food-spots.js: every entry sits inside the official
 * Intramuros administrative boundary (OpenStreetMap relation 103707), collected by
 * an Overpass query constrained to that polygon. Re-check with:
 *
 *   node tools/verify-in-intramuros.mjs
 *
 * READ THIS BEFORE USING THE PRICES
 * ---------------------------------
 * Nightly rates are DYNAMIC. The figures here are indicative ranges gathered from
 * published sources on 2026-09-03 (see `priceSource` on each record) — they are not
 * live rates and will not match what you see at booking time. Always confirm with
 * the property or an operator.
 *
 * ACCESS TYPES MATTER MORE THAN THE PRICES
 * ----------------------------------------
 * Only 3 of the 8 mapped properties are general-public accommodation. The rest are a
 * seafarers' union facility (members only, free to members) and student/long-stay
 * housing. They are kept here, clearly flagged, because omitting them silently would
 * misrepresent what is actually inside the walls.
 *
 * Data (c) OpenStreetMap contributors, ODbL. Retrieved 2026-09-03.
 */

/** Indicative nightly bands, used only to group properties at a glance. */
const STAY_TIERS = {
  1: { symbol: '₱',       label: 'Budget',    range: 'under ₱1,500'      },
  2: { symbol: '₱₱', label: 'Mid-range', range: '₱1,500 – ₱3,500'  },
  3: { symbol: '₱₱₱', label: 'Upscale', range: '₱3,500 – ₱7,000' },
  4: { symbol: '₱₱₱₱', label: 'Premium', range: '₱7,000 and up'   }
};

const ACCESS_TYPES = {
  public:     { label: 'Open to travellers',  note: 'Bookable by the general public.' },
  restricted: { label: 'Members only',        note: 'Not available to the general public.' },
  longstay:   { label: 'Student / long-stay', note: 'Dormitory or boarding house, not nightly tourist accommodation.' }
};

/** FX used for any USD-sourced figure below. */
const FX_USD_PHP = { rate: 62.5, asOf: '2026-09-02' };

const STAY_REVIEWED = '2026-09-03';

const HOTELS = [
  {
    id: 'the-bayleaf-intramuros',
    name: 'The Bayleaf Intramuros',
    access: 'public',
    lat: 14.590004, lng: 120.978725, osm: 'way/89568405',
    street: 'Muralla corner Victoria Street',
    area: 'Eastern wall, beside Lyceum of the Philippines University',
    rooms: 57,
    roomTypes: [
      'Superior Twin (23 sqm)', 'Deluxe Twin (25 sqm)', 'Deluxe Queen (25 sqm)',
      'Deluxe King (25 sqm)', 'Premier Trio (31 sqm)', 'Executive Suite (45 sqm)',
      'Bayleaf Suite (135 sqm)'
    ],
    priceTier: 3,
    priceRange: '₱2,800 – ₱13,300 per night',
    priceNote: 'From about ₱2,765 for a Superior; suites reach roughly ₱13,000. Typical standard room ₱4,000 – ₱9,100.',
    priceSource: "Hotel's own reservation page (₱2,765 'rates from'); aggregator listings US$46–US$213 converted at ₱62.5/US$",
    website: 'https://www.thebayleaf.com.ph/intramuros/',
    phone: '+63 2 5318 5000',
    email: 'tbi-inquiry@thebayleaf.com.ph',
    blurb: 'The only full-service boutique hotel inside the walls. Operated by Lyceum of the Philippines University; home to the Sky Deck rooftop bar, 9 Spoons and Cioccolata.'
  },
  {
    id: 'white-knight-hotel-intramuros',
    name: 'White Knight Hotel Intramuros',
    access: 'public',
    lat: 14.589591, lng: 120.975686, osm: 'node/1038011236',
    street: 'Plaza San Luis Complex, General Luna Street',
    area: 'Opposite San Agustin Church (mapped at Urdaneta Street)',
    rooms: 29,
    roomTypes: ['Standard', 'Queen', 'Double', 'Family/Group rooms'],
    priceTier: 2,
    priceRange: '₱1,750 – ₱5,100 per night',
    priceNote: 'Typically around ₱2,000 a night; standard rooms roughly ₱1,900 – ₱2,500.',
    priceSource: 'Aggregator listings US$28–US$82, average US$32, converted at ₱62.5/US$',
    website: null,
    phone: null,
    email: null,
    blurb: 'A 29-room boutique hotel in a restored Spanish colonial mansion in the Plaza San Luis complex — whitewashed walls, tile floors, wooden staircases. Has an in-house café.'
  },
  {
    id: 'residencia-729',
    name: 'Residencia 729',
    access: 'public',
    lat: 14.589739, lng: 120.976733, osm: 'way/639239855',
    street: 'Santa Potenciana Street',
    area: 'Southern quarter, near Cabildo Street',
    rooms: null,
    roomTypes: null,
    priceTier: null,
    priceRange: 'Not published',
    priceNote: 'No current nightly rate could be verified from any public source. An old directory listing (2009) records ₱3,000 per MONTH, suggesting it may operate as long-stay rather than nightly accommodation.',
    priceSource: 'None current — do not quote',
    website: null,
    phone: null,
    email: null,
    blurb: 'Tagged as a hotel in OpenStreetMap and located inside the walls, but with no verifiable current rates or booking presence. Contact directly before relying on it.'
  },

  /* ── Not general-public accommodation ─────────────────────────────────────── */

  {
    id: 'sailors-home-amosup',
    name: "Sailor's Home (AMOSUP)",
    access: 'restricted',
    lat: 14.589246, lng: 120.976048, osm: 'node/1038283674',
    street: '3 Cabildo Street',
    area: 'Southern quarter',
    rooms: 1024,
    roomTypes: ['Air-conditioned dormitory rooms (932 male beds, 92 female beds)'],
    priceTier: null,
    priceRange: 'Free to AMOSUP members in good standing',
    priceNote: 'Not open to the general public. Board and lodging for transient members of the Associated Marine Officers\' and Seamen\'s Union of the Philippines, running since 1978.',
    priceSource: 'AMOSUP union programme pages',
    website: 'https://amosup.org/union-programs/sailors-home/',
    phone: '+63 2 8527 8491',
    email: null,
    blurb: 'Large seafarers\' union facility with mess hall, gym, library and free continental breakfast — for union members waiting to board or heading home, not travellers.'
  },
  {
    id: 'amosup-sailors-home-annex',
    name: 'Amosup Sailors Home (annex)',
    access: 'restricted',
    lat: 14.589725, lng: 120.975950, osm: 'node/4427363294',
    street: 'Near Cabildo Street',
    area: 'Southern quarter, AMOSUP complex',
    rooms: null,
    roomTypes: null,
    priceTier: null,
    priceRange: 'Members only',
    priceNote: 'Second mapped point within the AMOSUP complex. Same members-only basis.',
    priceSource: 'AMOSUP union programme pages',
    website: 'https://amosup.org/union-programs/sailors-home/',
    phone: '+63 2 8527 8491',
    email: null,
    blurb: 'Part of the AMOSUP seafarers\' complex on Cabildo Street.'
  },
  {
    id: 'sailors-inn',
    name: 'Sailors Inn',
    access: 'restricted',
    lat: 14.592539, lng: 120.972063, osm: 'node/4869581521',
    street: 'Western Intramuros, near Santa Clara Street',
    area: 'Near the Ayuntamiento',
    rooms: null,
    roomTypes: null,
    priceTier: null,
    priceRange: 'Not published',
    priceNote: 'Mapped as a guest house serving the maritime sector. No public booking presence found; assume not open to general travellers without confirming.',
    priceSource: 'None',
    website: null,
    phone: null,
    email: null,
    blurb: 'Seafarer-oriented guest house on the western side of the walled city.'
  },
  {
    id: 'magallanes-dormitory',
    name: 'Magallanes Dormitory',
    access: 'longstay',
    lat: 14.588465, lng: 120.977879, osm: 'way/600963881',
    street: 'Magallanes Drive',
    area: 'South-eastern quarter, near the university campuses',
    rooms: null,
    roomTypes: ['Dormitory beds / shared rooms'],
    priceTier: null,
    priceRange: 'Not published — typically charged monthly',
    priceNote: 'Student housing serving the universities inside the walls (Lyceum, Mapua, PLM, Letran). Not nightly tourist accommodation.',
    priceSource: 'None',
    website: null,
    phone: null,
    email: null,
    blurb: 'Dormitory for students at the Intramuros university cluster.'
  },
  {
    id: '608-boarding-house',
    name: '608 Boarding House',
    access: 'longstay',
    lat: 14.588833, lng: 120.976837, osm: 'node/6778520887',
    street: 'Cabildo Street',
    area: 'Southern quarter',
    rooms: null,
    roomTypes: ['Boarding rooms'],
    priceTier: null,
    priceRange: 'Not published — typically charged monthly',
    priceNote: 'Boarding house, generally let by the month to students and workers rather than by the night.',
    priceSource: 'None',
    website: null,
    phone: null,
    email: null,
    blurb: 'Small boarding house on Cabildo Street.'
  }
];

/**
 * Reported inside Intramuros but NOT included above, because its coordinates could
 * not be resolved and therefore could not be tested against the boundary polygon.
 * Listed separately rather than mixed in with verified entries.
 */
const HOTELS_UNVERIFIED = [
  {
    name: 'Intramuros Stay by IN CAFE',
    claim: 'Marketed as being "at the heart of Intramuros"; a 1-bedroom unit with a cinema area across 4 floors, open since June 2024.',
    priceRange: 'About ₱3,387 per night (Cinema Room); average around ₱2,700',
    priceSource: 'Klook listing; average US$43 converted at ₱62.5/US$',
    why: 'No street address published and not resolvable in Nominatim, so its position could not be verified against the Intramuros boundary.'
  }
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { HOTELS, HOTELS_UNVERIFIED, STAY_TIERS, ACCESS_TYPES, FX_USD_PHP, STAY_REVIEWED };
}
