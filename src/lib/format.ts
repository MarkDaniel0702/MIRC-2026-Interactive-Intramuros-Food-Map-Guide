import { WALK_METRES_PER_MIN } from '../../data/tourist-spots.js';

/** HTML-entity escape for template interpolation into Leaflet popup/divIcon strings. */
export const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, m =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[m]);

/** Lowercase, strip accents, straighten quotes -- so "Belfry Café" matches "cafe". */
export const norm = (s: unknown): string =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-');

/** Great-circle distance in metres. */
export function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad, dLng = (bLng - aLng) * rad;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export const fmtDistance = (m: number): string =>
  m < 950 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;

export const walkMins = (metres: number): number =>
  Math.max(1, Math.round(metres / WALK_METRES_PER_MIN));

/** "14 min walk" / "1 h 5 min walk" -- ported verbatim from app.js:805-808. */
export function fmtMins(secs: number): string {
  const m = Math.max(1, Math.round(secs / 60));
  return m < 60 ? `${m} min walk` : `${Math.floor(m / 60)} h ${m % 60} min walk`;
}
