import { useMemo, useRef } from 'react';
import { MODES, MODE_KEYS } from '../data/modes';
import { matches } from '../lib/filter';
import type { FullAppState } from '../state/store';

/**
 * Every spot id that belongs on the MAP right now -- a union across every mode in
 * `state.mapModes`, not just the tab the sidebar list happens to be showing
 * (`useVisibleSpots`, unchanged, still drives the list alone). Each mode is
 * filtered by its own saved query/category/tier filters via the same `matches()`
 * the list uses, so turning on "See" for the map respects whatever Sights filters
 * are already set there rather than dumping every sight in unfiltered.
 *
 * Deliberately a separate hook from useVisibleSpots rather than a second mode of
 * it: that one returns sorted, distance-annotated VisibleSpot[] for rendering
 * list cards; useLeafletMap only ever wants a flat id list to sync the cluster
 * against, and conflating the two shapes for one caller that needs neither the
 * sort nor the distance would cost more clarity than it saves.
 */
export function useMapVisibleIds(state: FullAppState): string[] {
  // Stabilised by content, not just recomputed: SET_MODE spreads a fresh byMode
  // object on every tab switch even when the switch changes nothing about what
  // is filtered (going Eat -> See while See has no active filters, say), so a
  // naive useMemo keyed on [mapModes, byMode] hands useLeafletMap a new array
  // reference whose CONTENT happens to be identical. That reference change alone
  // is enough to re-run the cluster-sync effect (clearLayers + addLayers), and
  // removing-then-re-adding a marker while its popup is open closes the popup --
  // caught by clicking a cross-mode pin, which switches the active tab (a
  // SET_MODE dispatch) at the exact moment Leaflet's own click handler is
  // opening that marker's popup. Returning the SAME array whenever the id set
  // is unchanged keeps the effect from firing on a no-op change.
  const prevRef = useRef<string[]>([]);
  return useMemo(() => {
    const ids: string[] = [];
    for (const key of MODE_KEYS) {
      if (!state.mapModes.has(key)) continue;
      const m = MODES[key];
      const f = state.byMode[key];
      for (const s of m.items) if (matches(s, m, f)) ids.push(s.id);
    }
    const prev = prevRef.current;
    if (prev.length === ids.length && prev.every((id, i) => id === ids[i])) return prev;
    prevRef.current = ids;
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.mapModes, state.byMode]);
}
