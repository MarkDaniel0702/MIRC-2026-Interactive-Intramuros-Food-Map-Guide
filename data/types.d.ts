/**
 * Shared record shapes for the data/*.js files. These files stay plain ESM
 * JavaScript (not .ts) because tools/verify-in-intramuros.mjs and
 * tools/build-corpus.mjs -- and the Node runtime that runs them -- load them
 * directly with no TypeScript build step. JSDoc @type annotations on each
 * export point back here so the React app (src/) still gets full typing on
 * import.
 */

export interface Tier {
  symbol: string;
  label: string;
  range: string;
  short: string;
}

export interface Category {
  label: string;
  color: string;
  icon: string;
}

export interface FoodSpot {
  id: string;
  name: string;
  category: string;
  priceTier: number;
  cuisine: string[];
  street: string | null;
  area: string | null;
  lat: number;
  lng: number;
  osm: string | null;
  blurb: string;
  locationSource?: 'address' | 'street' | 'user';
  verified?: boolean;
}

export interface TouristSpot {
  id: string;
  name: string;
  category: string;
  feeTier: number;
  fee: string;
  feeShort: string;
  feeNote?: string;
  passport: boolean;
  hours: string;
  duration: string;
  durationMins: number;
  lat: number;
  lng: number;
  osm: string | null;
  street: string | null;
  area: string | null;
  blurb: string;
}

export interface Hotel {
  id: string;
  name: string;
  access: 'public' | 'restricted' | 'longstay';
  mapped: boolean;
  category: 'stay';
  lat: number;
  lng: number;
  osm: string | null;
  street: string | null;
  area: string | null;
  rooms?: number;
  roomTypes?: string[];
  priceTier: number;
  priceRange?: string;
  priceNote?: string;
  priceSource?: string;
  website?: string;
  phone?: string;
  email?: string;
  blurb: string;
}

export interface UnverifiedHotel {
  name: string;
  claim: string;
  priceRange: string;
  priceSource: string;
  why: string;
}

export interface AccessType {
  label: string;
  note: string;
}

export interface Landmark {
  id: string;
  name: string;
  short: string;
  kind: string;
  lat: number;
  lng: number;
  osm?: string;
  url?: string;
  blurb: string;
  campus?: boolean;
  provisional?: boolean;
  /** Unused by the current data but read by landmarkPopupHTML (app.js:312). */
  street?: string;
}

export interface StartPoint {
  id: string;
  name: string;
  note: string;
  lat: number;
  lng: number;
  osm: string;
  outside: boolean;
  /** The venue itself, offered as somewhere to walk FROM -- shown as a primary
   *  option, not an "arriving at" chip, and omitted from the chat corpus's
   *  arrival points. */
  venue?: boolean;
}

export interface VenueAnchor {
  name: string;
  lat: number;
  lng: number;
}

export interface IntramurosPassport {
  price: string;
  covers: string[];
  extra: string;
  note: string;
  url: string;
}

/** A GeoJSON linear ring: [lng, lat] pairs per the spec. */
export type Ring = [number, number][];

export interface BoundaryGeometry {
  type: 'Polygon' | 'MultiPolygon';
  /** Polygon: an array of rings (index 0 = outer ring). MultiPolygon: an array
   *  of polygons, each an array of rings. app.js:206 only ever reads
   *  coordinates[0], i.e. the outer ring, so callers narrow this themselves. */
  coordinates: Ring[] | Ring[][];
}

export interface BoundaryFeature {
  type: 'Feature';
  properties: { name: string; osm: string };
  geometry: BoundaryGeometry;
}
