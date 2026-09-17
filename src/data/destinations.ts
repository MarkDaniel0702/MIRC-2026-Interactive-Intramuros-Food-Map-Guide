/**
 * Anywhere "Get directions" can walk you to: an Eat / See / Stay spot, or one
 * of the landmarks -- the PLM campus and its buildings and halls (JAA, GK, GEE,
 * GA). Landmarks are deliberately outside MODES (no tab, no category, no
 * filters; see data/landmarks.js), so the directions path resolves its target
 * through this rather than findAnywhere, which only knows the three tabs.
 *
 * The common fields are all a route needs. The record itself rides along for
 * the one caller that renders differently per kind: the destination pin in
 * hooks/useLeafletMap.ts shows a category glyph for a spot and the landmark's
 * own short label for a landmark.
 */
import { LANDMARKS } from '../../data/landmarks.js';
import type { Landmark } from '../../data/types';
import { findAnywhere } from './modes';
import type { AnySpot, ModeKey } from '../types';

export type Destination =
  | { kind: 'spot'; id: string; name: string; lat: number; lng: number; spot: AnySpot; modeKey: ModeKey }
  | { kind: 'landmark'; id: string; name: string; lat: number; lng: number; landmark: Landmark };

export function findDestination(id: string): Destination | null {
  const hit = findAnywhere(id);
  if (hit) {
    const { spot, modeKey } = hit;
    return { kind: 'spot', id, name: spot.name, lat: spot.lat, lng: spot.lng, spot, modeKey };
  }
  const lm = (LANDMARKS as Landmark[]).find(l => l.id === id);
  return lm ? { kind: 'landmark', id, name: lm.name, lat: lm.lat, lng: lm.lng, landmark: lm } : null;
}
