import { MODES } from '../data/modes';
import type { ModeFilters, ModeKey } from '../types';

/** Ported from app.js:526-533 (the #count/#gripText half of render()). gripText
 *  (the collapsed bottom-sheet label) is rendered by Panel, reusing this same math. */
export function summarize(mode: ModeKey, filters: ModeFilters, visibleCount: number) {
  const m = MODES[mode];
  const total = m.items.length;
  const filtered = Boolean(filters.query || filters.cats.size || filters.tiers.size);
  return { total, filtered, noun: m.noun, visibleCount };
}

export function Count({ mode, filters, visibleCount }: {
  mode: ModeKey;
  filters: ModeFilters;
  visibleCount: number;
}) {
  const { total, filtered, noun } = summarize(mode, filters, visibleCount);
  return (
    <p className="count" role="status" aria-live="polite">
      {filtered
        ? <>Showing <b>{visibleCount}</b> of {total} {noun}</>
        : <><b>{total}</b> {noun} inside the walls</>}
    </p>
  );
}
