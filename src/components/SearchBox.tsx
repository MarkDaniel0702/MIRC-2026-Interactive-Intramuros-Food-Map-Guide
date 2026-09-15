import { useRef, useState } from 'react';
import type { Dispatch } from 'react';
import { MODES } from '../data/modes';
import { norm } from '../lib/format';
import type { Action } from '../state/store';
import type { ModeKey } from '../types';

/**
 * Ported from app.js:1046-1059 (input/clear handlers) and app.js:737-739
 * (mode-switch restoring the box to the saved, already-normalized query).
 *
 * `initialQuery` is only read once, at mount -- the parent renders this with a
 * `key` that changes on mode switch and on RESET_FILTERS (state.resetNonce), so
 * React remounts it fresh instead of this component diffing external resets
 * against its own debounced writes.
 */
export function SearchBox({ mode, initialQuery, dispatch }: {
  mode: ModeKey;
  initialQuery: string;
  dispatch: Dispatch<Action>;
}) {
  const [raw, setRaw] = useState(initialQuery);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setRaw(v);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => dispatch({ type: 'SET_QUERY', query: norm(v).trim() }), 130);
  }

  function onClear() {
    clearTimeout(timerRef.current);
    setRaw('');
    dispatch({ type: 'SET_QUERY', query: '' });
  }

  return (
    <div className="search">
      <svg className="search__icon" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="7" cy="7" r="4.6" /><path d="M10.4 10.4 14 14" />
      </svg>
      <input type="search" className="search__input"
        placeholder={MODES[mode].placeholder}
        aria-label="Search by name, cuisine or street"
        autoComplete="off" spellCheck={false}
        value={raw} onChange={onChange} />
      <button type="button" className="search__clear" aria-label="Clear search" hidden={raw.length === 0}
        onClick={onClear}>&times;</button>
    </div>
  );
}
