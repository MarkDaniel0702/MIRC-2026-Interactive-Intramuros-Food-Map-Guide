/**
 * Everything that differs between the Eat / See / Stay tabs lives here, so the
 * rest of the app stays single-path. Ported from app.js:97-153 (MODES table) and
 * app.js:192-202 (the one-time _mode/_hay/_anchorM decoration) -- but the derived
 * data is kept in a side index (DERIVED_INDEX), not written onto the source
 * records, per plan A3: mutating imported module arrays interacts badly with HMR
 * and StrictMode's double-invocation.
 */
import { FOOD_SPOTS, PRICE_TIERS, CATEGORIES, DATA_REVIEWED } from '../../data/food-spots.js';
import {
  TOURIST_SPOTS, FEE_TIERS, SIGHT_CATEGORIES,
  VENUE_ANCHOR, SIGHTS_REVIEWED
} from '../../data/tourist-spots.js';
import { HOTELS, STAY_TIERS, STAY_CATEGORIES, STAY_REVIEWED } from '../../data/hotels.js';
import { norm, haversine } from '../lib/format';
import type { AnySpot, DerivedInfo, ModeConfig, ModeKey } from '../types';

export const MODES: Record<ModeKey, ModeConfig> = {
  food: {
    key: 'food',
    label: 'Eat',
    items: FOOD_SPOTS as AnySpot[],
    categories: CATEGORIES,
    tiers: PRICE_TIERS,
    tierOf: s => s.priceTier as number,
    subtitle: 'Where to eat within the walls',
    placeholder: 'Search a name, dish or street…',
    filterLegend: 'Price range',
    filterNote: 'per person',
    legendTitle: 'Price key',
    legendNote: '— indicative, per person',
    noun: 'food spots',
    emptyText: 'No place to eat inside the walls matches these filters.',
    reviewed: DATA_REVIEWED
  },
  sights: {
    key: 'sights',
    label: 'See',
    items: TOURIST_SPOTS as AnySpot[],
    categories: SIGHT_CATEGORIES,
    tiers: FEE_TIERS,
    tierOf: s => s.feeTier as number,
    subtitle: 'What to see within the walls',
    placeholder: 'Search a name, period or street…',
    filterLegend: 'Entrance fee',
    filterNote: 'per person',
    legendTitle: 'Entrance fee key',
    legendNote: '— checked with the Intramuros Administration',
    noun: 'sights',
    emptyText: 'No sight inside the walls matches these filters.',
    reviewed: SIGHTS_REVIEWED
  },
  stay: {
    key: 'stay',
    label: 'Stay',
    // Only properties a traveller can both book AND compare on price -- see
    // data/hotels.js and HOTELS.md for why the rest are excluded from the map.
    items: (HOTELS as AnySpot[]).filter(h => h.mapped),
    categories: STAY_CATEGORIES,
    tiers: STAY_TIERS,
    tierOf: h => h.priceTier as number,
    hideCategoryFilter: true,
    subtitle: 'Where to stay within the walls',
    placeholder: 'Search a name or street…',
    filterLegend: 'Nightly rate',
    filterNote: 'per room',
    legendTitle: 'Nightly rate key',
    legendNote: '— indicative, see HOTELS.md',
    noun: 'places to stay',
    emptyText: 'No place to stay inside the walls matches these filters.',
    reviewed: STAY_REVIEWED
  }
};

export const MODE_KEYS = Object.keys(MODES) as ModeKey[];

/** Every spot across every mode, keyed by id -- mirrors app.js's `markers` Map key set. */
export const ALL_SPOTS: { spot: AnySpot; mode: ModeKey }[] = MODE_KEYS.flatMap(key =>
  MODES[key].items.map(spot => ({ spot, mode: key }))
);

function buildDerivedIndex(): Map<string, DerivedInfo> {
  const index = new Map<string, DerivedInfo>();
  for (const key of MODE_KEYS) {
    const m = MODES[key];
    for (const s of m.items) {
      const hay = norm([
        s.name, (s.cuisine || []).join(' '), s.street, s.area,
        m.categories[s.category].label, s.blurb, s.fee, s.duration,
        s.priceRange, (s.roomTypes || []).join(' ')
      ].filter(Boolean).join(' '));
      const anchorM = haversine(VENUE_ANCHOR.lat, VENUE_ANCHOR.lng, s.lat, s.lng);
      index.set(s.id, { mode: key, hay, anchorM });
    }
  }
  return index;
}

/** Computed once at module load -- same timing as app.js's one-time decoration loop. */
export const DERIVED_INDEX = buildDerivedIndex();

/** Find a record by id across every dataset, not just the active mode. Ported
 *  from app.js:177-183 findAnywhere. */
export function findAnywhere(id: string): { spot: AnySpot; modeKey: ModeKey } | null {
  for (const key of MODE_KEYS) {
    const hit = MODES[key].items.find(s => s.id === id);
    if (hit) return { spot: hit, modeKey: key };
  }
  return null;
}

export { VENUE_ANCHOR };
