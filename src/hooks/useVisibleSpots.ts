import { useMemo } from 'react';
import { MODES } from '../data/modes';
import { matches } from '../lib/filter';
import { haversine } from '../lib/format';
import type { AnySpot } from '../types';
import type { FullAppState } from '../state/store';

export interface VisibleSpot {
  spot: AnySpot;
  dist: number | null;
}

/**
 * The data half of app.js:481-543 render() -- filter, then sort by distance from
 * userPos if known, else alphabetically. The map-sync half (cluster layers, first
 * paint stagger) lives in useLeafletMap, which takes the id list this produces.
 */
export function useVisibleSpots(state: FullAppState): VisibleSpot[] {
  const f = state.byMode[state.mode];
  return useMemo(() => {
    const m = MODES[state.mode];
    const filtered = m.items.filter(s => matches(s, m, f));

    if (state.userPos) {
      const { lat, lng } = state.userPos;
      const withDist = filtered.map(spot => ({ spot, dist: haversine(lat, lng, spot.lat, spot.lng) }));
      withDist.sort((a, b) => a.dist - b.dist);
      return withDist;
    }

    return [...filtered]
      .sort((a, b) => a.name.localeCompare(b.name, 'en'))
      .map(spot => ({ spot, dist: null as number | null }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.mode, f.query, f.cats, f.tiers, state.userPos]);
}
