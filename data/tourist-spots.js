/**
 * Tourist and heritage spots inside Intramuros, Manila.
 *
 * Built for visiting researchers: short, self-contained visits within walking
 * distance of each other, with real entrance fees and honest time estimates.
 *
 * Same discipline as data/food-spots.js — every coordinate comes from an Overpass
 * query constrained to the official Intramuros administrative boundary (OSM
 * relation 103707) and is re-checked by:
 *
 *   node tools/verify-in-intramuros.mjs
 *
 * ENTRANCE FEES are from the Intramuros Administration (intramuros.gov.ph) and the
 * operators' own pages, checked 2026-09-03. Unlike hotel rates these are published
 * and stable, but they do change — the site shows the check date.
 *
 * Data (c) OpenStreetMap contributors, ODbL.
 */

/** Entrance-fee bands. Tier 0 is free, which is most of the walled city. */
const FEE_TIERS = {
  0: { symbol: 'FREE', label: 'Free entry', range: 'No entrance fee',  short: 'Free'      },
  1: { symbol: '₱',    label: 'Low',        range: '₱75 – ₱100',       short: '₱75–100'   },
  2: { symbol: '₱₱',   label: 'Standard',   range: '₱150 – ₱200',      short: '₱150–200'  }
};

/** Sight categories -> display label + marker colour (same navy/green/gold system). */
const SIGHT_CATEGORIES = {
  museum:   { label: 'Museums',                 color: '#D4A82F', icon: 'museum'   },
  church:   { label: 'Churches',                color: '#C9D6E6', icon: 'church'   },
  fort:     { label: 'Walls, Gates & Bastions', color: '#6C8FD4', icon: 'gate'     },
  plaza:    { label: 'Plazas & Gardens',        color: '#82C144', icon: 'tree'     },
  monument: { label: 'Monuments & Ruins',       color: '#2FA37A', icon: 'obelisk'  }
};

/**
 * Reference point for the "N min walk" shown on every sight.
 *
 * >>> CHANGE THIS to the conference venue and every distance re-bases itself. <<<
 * Default is Plaza de Roma, the historic centre of the walled city.
 */
const VENUE_ANCHOR = {
  name: 'Plaza de Roma',
  lat: 14.592183,
  lng: 120.973083
};

/** Average walking pace used to turn metres into minutes. */
const WALK_METRES_PER_MIN = 80;

/**
 * The Intramuros Administration sells a combined ticket. Worth flagging to anyone
 * planning to see more than two of the paid sites.
 */
const INTRAMUROS_PASSPORT = {
  price: '₱350',
  covers: ['Fort Santiago', 'Casa Manila', 'Museo de Intramuros', 'Baluarte de San Diego', 'Centro de Turismo'],
  extra: 'Includes a free guided tranvía tour.',
  note: 'Centro de Turismo is the fifth covered site; it is not pinned here because its coordinates could not be verified.',
  url: 'https://intramuros.gov.ph/guide-museums/'
};

const SIGHTS_REVIEWED = '2026-09-03';

const TOURIST_SPOTS = [
  /* ── Paid sites ───────────────────────────────────────────────────────────── */
  {
    id: 'fort-santiago', name: 'Fort Santiago', category: 'fort',
    feeTier: 1, fee: '₱75', feeShort: '₱75', feeNote: '₱50 for students, seniors and PWD', passport: true,
    hours: 'Mon–Fri 8am–10pm · Sat–Sun 6am–10pm',
    duration: '1.5–2 hrs', durationMins: 105,
    lat: 14.594252, lng: 120.970362, osm: 'way/828670531',
    street: 'Santa Clara Street', area: 'Northern tip, by the Pasig River',
    blurb: 'The Spanish citadel guarding the mouth of the Pasig, begun 1571 on the site of Rajah Sulayman\'s settlement. José Rizal was held here before his execution in 1896; brass footsteps trace his last walk across the courtyard. The pin marks the main gate, where tickets are sold.'
  },
  {
    id: 'rizal-shrine', name: 'Rizal Shrine', category: 'museum',
    feeTier: 1, fee: 'Included in Fort Santiago entry', feeShort: 'Incl.', feeNote: 'No separate ticket', passport: true,
    hours: 'Tue–Sun 8am–5pm (inside Fort Santiago)',
    duration: '45 min', durationMins: 45,
    lat: 14.594514, lng: 120.969708, osm: 'way/27275508',
    street: 'Inside Fort Santiago', area: 'Fort Santiago',
    blurb: 'Museum in the barracks where Rizal spent his final hours, holding his manuscripts, personal effects and the original of "Mi Último Adiós", smuggled out in an oil lamp.'
  },
  {
    id: 'san-agustin-church', name: 'San Agustin Church', category: 'church',
    feeTier: 0, fee: 'Free', feeShort: 'Free', feeNote: 'The adjoining museum is ticketed separately', passport: false,
    hours: 'Daily, roughly 8am–6pm (closed to visitors during Mass and weddings)',
    duration: '30 min', durationMins: 30,
    lat: 14.588915, lng: 120.975345, osm: 'way/89571506',
    street: 'General Luna Street', area: 'Opposite Plaza San Luis',
    blurb: 'Completed in 1607, the oldest stone church in the Philippines and a UNESCO World Heritage Site. It was the only Intramuros church left standing after the 1945 Battle of Manila. The barrel-vaulted ceiling is a trompe-l\'œil painted flat in 1875.'
  },
  {
    id: 'san-agustin-museum', name: 'San Agustin Museum', category: 'museum',
    feeTier: 2, fee: '₱200', feeShort: '₱200', feeNote: '₱160 for students, seniors, PWD and frontliners', passport: false,
    hours: 'Mon/Wed/Fri–Sun 8am–5pm · Tue & Thu 8am–6pm',
    duration: '1–1.5 hrs', durationMins: 75,
    lat: 14.588562, lng: 120.974782, osm: 'way/829243249',
    street: 'General Luna Street', area: 'Augustinian monastery, beside the church',
    blurb: 'The monastery beside San Agustin, now a museum of religious art, vestments and colonial-era furniture arranged around two storeys of cloisters. Quiet, and the best single introduction to Spanish-era ecclesiastical Manila.'
  },
  {
    id: 'casa-manila', name: 'Casa Manila', category: 'museum',
    feeTier: 1, fee: '₱75', feeShort: '₱75', feeNote: '₱50 for students, seniors and PWD', passport: true,
    hours: 'Tue–Sun 9am–6pm · closed Monday',
    duration: '45 min', durationMins: 45,
    lat: 14.589733, lng: 120.975250, osm: 'node/10699319606',
    street: 'General Luna Street', area: 'Plaza San Luis Complex',
    blurb: 'A 1980s reconstruction of an 1850s colonial merchant house, furnished room by room to show how a wealthy Manila family lived — from the caída and sala down to the paired lavatories.'
  },
  {
    id: 'museo-de-intramuros', name: 'Museo de Intramuros', category: 'museum',
    feeTier: 2, fee: '₱200', feeShort: '₱200', feeNote: '₱160 for students, seniors and PWD', passport: true,
    hours: 'Tue–Sun 9am–6pm · closed Monday',
    duration: '1 hr', durationMins: 60,
    lat: 14.589940, lng: 120.973225, osm: 'way/89184421',
    street: 'Arzobispo corner Anda Street', area: 'Reconstructed San Ignacio Church',
    blurb: 'The Intramuros Administration\'s ecclesiastical art collection, opened 2019 inside the rebuilt shell of San Ignacio Church. Colonial santos, retablos and ivory carvings, shown in a deliberately modern interior.'
  },
  {
    id: 'bahay-tsinoy', name: 'Bahay Tsinoy', category: 'museum',
    feeTier: 1, fee: '₱100', feeShort: '₱100', feeNote: '₱60 for students', passport: false,
    hours: 'Tue–Sun 1pm–5pm · closed Monday',
    duration: '1–1.5 hrs', durationMins: 75,
    lat: 14.590901, lng: 120.975036, osm: 'node/11729816009',
    street: 'Anda corner Cabildo Street', area: 'Kaisa Heritage Center',
    blurb: 'Museum of Chinese life in the Philippines, run by Kaisa Para Sa Kaunlaran. Traces the Tsinoy community from pre-colonial trade through the Parián, the galleon era and the Second World War. Strong on primary material.'
  },
  {
    id: 'baluarte-de-san-diego', name: 'Baluarte de San Diego', category: 'fort',
    feeTier: 1, fee: '₱75', feeShort: '₱75', feeNote: '₱50 for students, seniors and PWD', passport: true,
    hours: 'Daily 8am–5pm',
    duration: '45 min', durationMins: 45,
    lat: 14.585478, lng: 120.975655, osm: 'node/12597662001',
    street: 'Muralla Street', area: 'Southern wall',
    blurb: 'A circular bastion begun in 1586 to a design by the Jesuit Antonio Sedeño — among the oldest stone fortifications in the country. Excavated ruins now sit inside landscaped gardens, and you can walk the rampart.'
  },

  /* ── Free sites ───────────────────────────────────────────────────────────── */
  {
    id: 'manila-cathedral', name: 'Manila Cathedral', category: 'church',
    feeTier: 0, fee: 'Free', feeShort: 'Free', feeNote: 'Closed to sightseers during Mass and weddings', passport: false,
    hours: 'Daily, roughly 7am–6pm',
    duration: '30 min', durationMins: 30,
    lat: 14.591506, lng: 120.973611, osm: 'way/331777144',
    street: 'Cabildo corner Beaterio Street', area: 'Plaza de Roma',
    blurb: 'The Minor Basilica of the Immaculate Conception. The present building, finished in 1958, is the eighth on this site — its predecessors were taken in turn by fire, typhoon, earthquake and the 1945 battle. Belgian stained glass and a Dutch pipe organ.'
  },
  {
    id: 'plaza-de-roma', name: 'Plaza de Roma', category: 'plaza',
    feeTier: 0, fee: 'Free', feeShort: 'Free', feeNote: null, passport: false,
    hours: 'Open at all hours',
    duration: '15 min', durationMins: 15,
    lat: 14.592183, lng: 120.973083, osm: 'way/24159652',
    street: 'Cabildo Street', area: 'Between the Cathedral and the Ayuntamiento',
    blurb: 'The main square of Spanish Manila and the natural place to start. It was a bullring until the 1790s, then Plaza McKinley under the Americans, renamed Plaza de Roma in 1961. The King Charles IV monument stands at its centre.'
  },
  {
    id: 'ayuntamiento', name: 'Ayuntamiento de Manila', category: 'monument',
    feeTier: 0, fee: 'Free (exterior)', feeShort: 'Free', feeNote: 'A working government building; interior access is limited', passport: false,
    hours: 'Exterior viewable at all hours',
    duration: '15 min', durationMins: 15,
    lat: 14.592508, lng: 120.973327, osm: 'node/1038225360',
    street: 'Andres Soriano Avenue', area: 'Plaza de Roma',
    blurb: 'The Casas Consistoriales — city hall of Spanish Manila, destroyed in 1945 and rebuilt in 2013 behind its original neoclassical facade. Now the Bureau of the Treasury.'
  },
  {
    id: 'memorare-manila-1945', name: 'Memorare — Manila 1945', category: 'monument',
    feeTier: 0, fee: 'Free', feeShort: 'Free', feeNote: null, passport: false,
    hours: 'Open at all hours',
    duration: '10 min', durationMins: 10,
    lat: 14.590514, lng: 120.974513, osm: 'node/735198858',
    street: 'Anda Street', area: 'Plazuela de Santa Isabel',
    blurb: 'Peter de Guzman\'s 1995 memorial to the roughly 100,000 civilians killed in the month-long Battle of Manila. A huddled group of figures beneath a grieving woman, with an inscription worth reading in full — the most affecting thing in Intramuros.'
  },
  {
    id: 'plazuela-de-santa-isabel', name: 'Plazuela de Santa Isabel', category: 'plaza',
    feeTier: 0, fee: 'Free', feeShort: 'Free', feeNote: null, passport: false,
    hours: 'Open at all hours',
    duration: '10 min', durationMins: 10,
    lat: 14.590474, lng: 120.974457, osm: 'way/72518968',
    street: 'Anda corner Real Street', area: 'Central Intramuros',
    blurb: 'The small square that holds the Memorare monument, on the site of the Colegio de Santa Isabel — one of the oldest schools for girls in Asia.'
  },
  {
    id: 'puerta-real', name: 'Puerta Real', category: 'fort',
    feeTier: 0, fee: 'Free', feeShort: 'Free', feeNote: 'Gardens close at dusk', passport: false,
    hours: 'Gardens roughly 8am–6pm',
    duration: '20 min', durationMins: 20,
    lat: 14.586164, lng: 120.977048, osm: 'way/828320208',
    street: 'Muralla Street', area: 'Southern wall',
    blurb: 'The Royal Gate, reserved for the Governor-General and opened only on ceremonial occasions. Rebuilt in the 1960s; the sunken gardens beside it are a good quiet stop.'
  },
  {
    id: 'puerta-de-isabel-ii', name: 'Puerta de Isabel II', category: 'fort',
    feeTier: 0, fee: 'Free', feeShort: 'Free', feeNote: null, passport: false,
    hours: 'Open at all hours',
    duration: '10 min', durationMins: 10,
    lat: 14.594150, lng: 120.976253, osm: 'node/10243714050',
    street: 'Magallanes Drive', area: 'Northern wall',
    blurb: 'Opened in 1861 and named for Queen Isabella II of Spain, whose statue once stood before it. The newest of the original gates, cut to ease traffic to the river district.'
  },
  {
    id: 'puerta-de-santa-lucia', name: 'Puerta de Santa Lucia', category: 'fort',
    feeTier: 0, fee: 'Free', feeShort: 'Free', feeNote: null, passport: false,
    hours: 'Open at all hours',
    duration: '15 min', durationMins: 15,
    lat: 14.588503, lng: 120.973714, osm: 'way/331675588',
    street: 'Santa Lucia Street', area: 'Western wall, facing Manila Bay',
    blurb: 'A western gate opening toward the bay, with one of the better-preserved stretches of curtain wall and a ravelin still in front of it.'
  },
  {
    id: 'postigo-del-palacio', name: 'Postigo del Palacio', category: 'fort',
    feeTier: 0, fee: 'Free', feeShort: 'Free', feeNote: null, passport: false,
    hours: 'Open at all hours',
    duration: '10 min', durationMins: 10,
    lat: 14.590872, lng: 120.972235, osm: 'way/828366033',
    street: 'Muralla Street', area: 'Western wall',
    blurb: 'The Postern of the Palace — the Governor-General\'s private gate to the river and the bay, small enough to be missed and carrying a relief of Our Lady of Solitude above the arch.'
  },
  {
    id: 'baluarte-de-san-andres', name: 'Baluarte de San Andrés', category: 'fort',
    feeTier: 0, fee: 'Free', feeShort: 'Free', feeNote: null, passport: false,
    hours: 'Open at all hours',
    duration: '20 min', durationMins: 20,
    lat: 14.587070, lng: 120.978627, osm: 'way/331628853',
    street: 'Muralla Street', area: 'South-eastern wall',
    blurb: 'A bastion on the south-eastern angle of the walls, one of the quieter points to get up onto the ramparts and see how thick the Spanish defences actually were.'
  },
  {
    id: 'santa-lucia-barracks', name: 'Santa Lucia Barracks Ruins', category: 'monument',
    feeTier: 0, fee: 'Free', feeShort: 'Free', feeNote: null, passport: false,
    hours: 'Open at all hours',
    duration: '15 min', durationMins: 15,
    lat: 14.587591, lng: 120.974513, osm: 'way/89572175',
    street: 'Santa Lucia Street', area: 'Southern quarter',
    blurb: 'What is left of the Spanish infantry barracks, flattened in 1945 and deliberately left unreconstructed. The clearest surviving evidence in Intramuros of how total the destruction was.'
  },
  {
    id: 'plaza-mexico', name: 'Plaza México', category: 'plaza',
    feeTier: 0, fee: 'Free', feeShort: 'Free', feeNote: null, passport: false,
    hours: 'Open at all hours',
    duration: '15 min', durationMins: 15,
    lat: 14.594547, lng: 120.974557, osm: 'relation/18378284',
    street: 'Aduana Street', area: 'Northern quarter, near the river',
    blurb: 'A square commemorating the Manila–Acapulco galleon trade, which ran between these two ports for 250 years and made Intramuros the hinge of the first genuinely global trade route.'
  },
  {
    id: 'plaza-moriones', name: 'Plaza Moriones', category: 'plaza',
    feeTier: 1, fee: 'Inside Fort Santiago (₱75)', feeShort: '₱75', feeNote: 'Covered by the Fort Santiago ticket', passport: true,
    hours: 'With Fort Santiago',
    duration: '15 min', durationMins: 15,
    lat: 14.593274, lng: 120.971102, osm: 'way/85932692',
    street: 'Inside Fort Santiago', area: 'Fort Santiago',
    blurb: 'The old parade ground inside Fort Santiago, now lawn and acacia. The open space that makes the fort a pleasant place to sit rather than only to tour.'
  }
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TOURIST_SPOTS, FEE_TIERS, SIGHT_CATEGORIES,
    VENUE_ANCHOR, WALK_METRES_PER_MIN, INTRAMUROS_PASSPORT, SIGHTS_REVIEWED
  };
}
