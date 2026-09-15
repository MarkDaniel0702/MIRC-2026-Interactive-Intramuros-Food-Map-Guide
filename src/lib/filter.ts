import type { AnySpot, ModeConfig, ModeFilters } from '../types';
import { DERIVED_INDEX } from '../data/modes';

/** Ported verbatim from app.js:470-479. */
export function matches(spot: AnySpot, m: ModeConfig, f: ModeFilters): boolean {
  if (f.cats.size && !f.cats.has(spot.category)) return false;
  if (f.tiers.size && !f.tiers.has(String(m.tierOf(spot)))) return false;
  if (f.query) {
    const hay = DERIVED_INDEX.get(spot.id)?.hay ?? '';
    for (const term of f.query.split(/\s+/)) {
      if (term && !hay.includes(term)) return false;
    }
  }
  return true;
}

/**
 * Only a price/fee tier that has members in the mode's full dataset gets a chip --
 * otherwise the Stay tab would render five chips for two hotels, three of which
 * always resolve to "nothing matches". Ported from app.js:682-689 (the counting
 * half; pruning stale saved filters is the reducer's job -- see state/store.ts).
 */
export function tierCounts(m: ModeConfig): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of m.items) {
    const t = m.tierOf(s);
    if (t != null) counts[String(t)] = (counts[String(t)] || 0) + 1;
  }
  return counts;
}
