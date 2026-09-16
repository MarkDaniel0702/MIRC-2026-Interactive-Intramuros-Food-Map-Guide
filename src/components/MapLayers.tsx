import type { Dispatch } from 'react';
import { MODES, MODE_KEYS } from '../data/modes';
import type { Action } from '../state/store';
import type { ModeKey } from '../types';

/** One glyph per mode, lifted straight from Tabs.tsx so the same dataset reads as
 *  the same shape in both places. */
const ICON: Record<ModeKey, string> = {
  food: 'M5.4 2.4v3.6a1.5 1.5 0 0 0 3 0V2.4M6.9 7.4v6.2M11.4 2.4c1.1 1.5 1.1 3.7 0 4.9v6.3',
  sights: 'M2 13.5h12M3.4 13.5V7M6.5 13.5V7M9.5 13.5V7M12.6 13.5V7M2 6.4 8 2.6l6 3.8z',
  stay: 'M2.2 12.8V4.4M2.2 8.2h11.6a2 2 0 0 1 2 2v2.6M2.2 11h13.6M5.4 6.9a1.3 1.3 0 1 0 0-.1z'
};

/**
 * "Show on map" -- lets Eat, See and Stay pins appear together, independent of
 * which one tab the sidebar list is currently showing (state.mode). The active
 * tab's own chip is always pressed and disabled: hiding the pins the open list
 * is describing would read as a bug, not a filter, so that choice is not offered
 * (TOGGLE_MAP_MODE already refuses it too -- disabling the control here as well
 * is about the chip not inviting a click that would silently do nothing).
 */
export function MapLayers({ mode, mapModes, dispatch }: {
  mode: ModeKey;
  mapModes: Set<ModeKey>;
  dispatch: Dispatch<Action>;
}) {
  return (
    <fieldset className="filter" id="mapLayerFilter">
      <legend className="filter__legend">Show on map</legend>
      <div className="chips">
        {MODE_KEYS.map(key => {
          const on = mapModes.has(key);
          const locked = key === mode;
          return (
            <button key={key} type="button" className={`chip${locked ? ' chip--locked' : ''}`}
              role="switch" aria-pressed={on} disabled={locked}
              title={locked ? `${MODES[key].label} is the open tab, so it always shows` : undefined}
              onClick={() => dispatch({ type: 'TOGGLE_MAP_MODE', mode: key })}>
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d={ICON[key]} /></svg>
              {MODES[key].label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
