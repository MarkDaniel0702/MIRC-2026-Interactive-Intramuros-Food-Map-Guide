import type { LatLng, ModeFilters, ModeKey } from '../types';
import type { RouteResult } from '../lib/routing';
import { MODE_KEYS, MODES } from '../data/modes';
import { tierCounts } from '../lib/filter';

function emptyFilters(): ModeFilters {
  return { query: '', cats: new Set(), tiers: new Set() };
}

export interface FullDirsState {
  open: boolean;
  destId: string | null;
  start: (LatLng & { id: string; name: string }) | null;
  picking: boolean;
  busy: boolean;
  message: { text: string; kind?: 'busy' | 'warn' } | null;
  result: RouteResult | null;
}

/**
 * activeId/activeFrom are set ONLY by the SET_ACTIVE action, dispatched by
 * hooks/useLeafletMap.ts's `setActive` helper -- never inline in another case --
 * because setActive also owns a side effect the reducer cannot see: the pin's
 * `.is-active` DOM class (Leaflet-owned, see plan A6). Every other action here
 * mirrors an app.js function that calls setActive() as a separate step, so this
 * reducer does the same: it never touches activeId itself.
 */
export interface FullAppState {
  mode: ModeKey;
  byMode: Record<ModeKey, ModeFilters>;
  activeId: string | null;
  activeFrom: 'list' | 'map' | null;
  userPos: LatLng | null;
  dirs: FullDirsState;
  /** Bumped by RESET_FILTERS so SearchBox can key(){} itself back to a fresh,
   *  uncontrolled-feeling input without diffing state to detect an external reset
   *  (app.js:766 just writes $('#search').value = '' directly). */
  resetNonce: number;
}

export function initialState(): FullAppState {
  const byMode = {} as Record<ModeKey, ModeFilters>;
  for (const key of MODE_KEYS) byMode[key] = emptyFilters();
  return {
    mode: 'food',
    byMode,
    activeId: null,
    activeFrom: null,
    userPos: null,
    dirs: { open: false, destId: null, start: null, picking: false, busy: false, message: null, result: null },
    resetNonce: 0
  };
}

/**
 * Only a saved tier filter that no longer has a chip to switch it off is worth
 * dropping -- it could otherwise only ever filter the list down to nothing with
 * no visible control to undo it. Ported from app.js:687-689 (buildChips' pruning
 * side effect), moved here per plan A4 since it cannot run in a render path.
 */
function pruneTiers(filters: ModeFilters, mode: ModeKey): ModeFilters {
  const counts = tierCounts(MODES[mode]);
  const kept = [...filters.tiers].filter(t => counts[t]);
  if (kept.length === filters.tiers.size) return filters;
  return { ...filters, tiers: new Set(kept) };
}

export type Action =
  | { type: 'SET_MODE'; mode: ModeKey }
  | { type: 'SET_QUERY'; query: string }
  | { type: 'TOGGLE_CHIP'; group: 'cat' | 'tier'; value: string }
  | { type: 'RESET_FILTERS' }
  | { type: 'SET_ACTIVE'; id: string | null; from: 'list' | 'map' | null }
  | { type: 'SET_USER_POS'; pos: LatLng }
  | { type: 'DIRS_OPEN'; destId: string; mode: ModeKey }
  | { type: 'DIRS_CLOSE' }
  | { type: 'DIRS_SET_START'; start: LatLng & { id: string; name: string } }
  | { type: 'DIRS_SET_PICKING'; picking: boolean }
  | { type: 'DIRS_SET_BUSY'; busy: boolean }
  | { type: 'DIRS_SET_MESSAGE'; message: { text: string; kind?: 'busy' | 'warn' } | null }
  | { type: 'DIRS_SET_RESULT'; result: RouteResult };

export function reducer(state: FullAppState, action: Action): FullAppState {
  switch (action.type) {
    case 'SET_MODE': {
      if (action.mode === state.mode) return state;
      return {
        ...state,
        mode: action.mode,
        byMode: { ...state.byMode, [action.mode]: pruneTiers(state.byMode[action.mode], action.mode) }
      };
    }

    case 'SET_QUERY':
      return { ...state, byMode: { ...state.byMode, [state.mode]: { ...state.byMode[state.mode], query: action.query } } };

    case 'TOGGLE_CHIP': {
      const f = state.byMode[state.mode];
      const set = new Set(action.group === 'cat' ? f.cats : f.tiers);
      set.has(action.value) ? set.delete(action.value) : set.add(action.value);
      const next = action.group === 'cat' ? { ...f, cats: set } : { ...f, tiers: set };
      return { ...state, byMode: { ...state.byMode, [state.mode]: next } };
    }

    // Ported from app.js:761-765 resetAll -- clears the ACTIVE mode's filters only,
    // despite the name (filters() is mode-scoped there too).
    case 'RESET_FILTERS':
      return { ...state, byMode: { ...state.byMode, [state.mode]: emptyFilters() }, resetNonce: state.resetNonce + 1 };

    case 'SET_ACTIVE':
      return { ...state, activeId: action.id, activeFrom: action.from };

    case 'SET_USER_POS':
      return { ...state, userPos: action.pos };

    case 'DIRS_OPEN':
      return {
        ...state,
        mode: action.mode,
        byMode: action.mode === state.mode ? state.byMode : { ...state.byMode, [action.mode]: pruneTiers(state.byMode[action.mode], action.mode) },
        dirs: { ...state.dirs, open: true, destId: action.destId, picking: false, message: null, result: null }
      };

    case 'DIRS_CLOSE':
      return { ...state, dirs: { open: false, destId: null, start: state.dirs.start, picking: false, busy: false, message: null, result: null } };

    case 'DIRS_SET_START':
      return { ...state, dirs: { ...state.dirs, start: action.start } };

    case 'DIRS_SET_PICKING':
      return { ...state, dirs: { ...state.dirs, picking: action.picking } };

    case 'DIRS_SET_BUSY':
      return { ...state, dirs: { ...state.dirs, busy: action.busy } };

    case 'DIRS_SET_MESSAGE':
      return { ...state, dirs: { ...state.dirs, message: action.message } };

    case 'DIRS_SET_RESULT':
      return { ...state, dirs: { ...state.dirs, result: action.result } };

    default:
      return state;
  }
}
