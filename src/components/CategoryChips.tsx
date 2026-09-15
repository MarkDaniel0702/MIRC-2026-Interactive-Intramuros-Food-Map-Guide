import type { Dispatch } from 'react';
import { MODES } from '../data/modes';
import type { Action } from '../state/store';
import type { ModeKey } from '../types';

/** Ported from app.js:672-677 (buildChips' category half) and index.html:75-78. */
export function CategoryChips({ mode, cats, dispatch }: {
  mode: ModeKey;
  cats: Set<string>;
  dispatch: Dispatch<Action>;
}) {
  const m = MODES[mode];
  if (m.hideCategoryFilter) return null;

  return (
    <fieldset className="filter" id="categoryFilter">
      <legend className="filter__legend">Category</legend>
      <div className="chips">
        {Object.entries(m.categories).map(([key, cat]) => (
          <button key={key} type="button" className="chip" role="switch"
            aria-pressed={cats.has(key)} style={{ '--c': cat.color } as React.CSSProperties}
            onClick={() => dispatch({ type: 'TOGGLE_CHIP', group: 'cat', value: key })}>
            <span className="chip__dot"></span>{cat.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
