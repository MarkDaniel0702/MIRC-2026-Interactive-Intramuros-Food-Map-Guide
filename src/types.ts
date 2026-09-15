import type { Tier, Category } from '../data/types';

export type ModeKey = 'food' | 'sights' | 'stay';

/**
 * A loose union of every field that appears on a FoodSpot, TouristSpot or Hotel
 * record. The original app treats these three record shapes polymorphically
 * (branching on `_mode` at render time, e.g. app.js popupHTML/cardHTML) rather
 * than through a shared interface, so this type mirrors that: the common fields
 * are required, everything mode-specific is optional.
 */
export interface AnySpot {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  osm?: string | null;
  street?: string | null;
  area?: string | null;
  blurb: string;

  // food
  priceTier?: number;
  cuisine?: string[];
  locationSource?: 'address' | 'street' | 'user';
  verified?: boolean;

  // sights
  feeTier?: number;
  fee?: string;
  feeShort?: string;
  feeNote?: string;
  passport?: boolean;
  hours?: string;
  duration?: string;
  durationMins?: number;

  // stay
  access?: 'public' | 'restricted' | 'longstay';
  mapped?: boolean;
  rooms?: number;
  roomTypes?: string[];
  priceRange?: string;
  priceNote?: string;
  priceSource?: string;
  website?: string;
  phone?: string;
  email?: string;
}

export interface ModeConfig {
  key: ModeKey;
  label: string;
  items: AnySpot[];
  categories: Record<string, Category>;
  tiers: Record<string, Tier>;
  tierOf: (item: AnySpot) => number;
  hideCategoryFilter?: boolean;
  subtitle: string;
  placeholder: string;
  filterLegend: string;
  filterNote: string;
  legendTitle: string;
  legendNote: string;
  noun: string;
  emptyText: string;
  reviewed: string;
}

export interface LatLng {
  lat: number;
  lng: number;
}

/** Per-spot data computed once and looked up by id -- never written onto the
 *  source records themselves (app.js:192-202 did that; see plan A3). */
export interface DerivedInfo {
  mode: ModeKey;
  hay: string;
  anchorM: number;
}

export interface ModeFilters {
  query: string;
  cats: Set<string>;
  tiers: Set<string>;
}

export interface DirectionsState {
  open: boolean;
  destId: string | null;
  start: (LatLng & { id: string; name: string }) | null;
  picking: boolean;
  busy: boolean;
}

export interface AppState {
  mode: ModeKey;
  byMode: Record<ModeKey, ModeFilters>;
  activeId: string | null;
  userPos: LatLng | null;
  dirs: DirectionsState;
}
