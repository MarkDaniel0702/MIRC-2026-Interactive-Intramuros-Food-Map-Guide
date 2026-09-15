import type { Dispatch } from 'react';
import { MODES } from '../data/modes';
import { tierCounts } from '../lib/filter';
import type { Action } from '../state/store';
import type { ModeKey } from '../types';

/** Ported from app.js:679-702 (buildChips' price/fee half). Only a tier with
 *  members in the current mode's full dataset gets a chip. */
export function PriceChips({ mode, tiers, dispatch }: {
  mode: ModeKey;
  tiers: Set<string>;
  dispatch: Dispatch<Action>;
}) {
  const m = MODES[mode];
  const counts = tierCounts(m);

  return (
    <fieldset className="filter">
      <legend className="filter__legend">
        {m.filterLegend} <span className="filter__note">{m.filterNote}</span>
      </legend>
      <div className="chips chips--price">
        {Object.entries(m.tiers)
          .filter(([tier]) => counts[tier])
          .map(([tier, meta]) => (
            <button key={tier} type="button" className="chip" role="switch"
              aria-pressed={tiers.has(tier)}
              aria-label={`${meta.label}, ${meta.range}`}
              onClick={() => dispatch({ type: 'TOGGLE_CHIP', group: 'tier', value: tier })}>
              <span className="chip__peso">{meta.symbol}</span>
              <span className="chip__band">{meta.short}</span>
            </button>
          ))}
      </div>
    </fieldset>
  );
}
