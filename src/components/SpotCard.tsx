import { MODES } from '../data/modes';
import { DERIVED_INDEX } from '../data/modes';
import { fmtDistance, walkMins } from '../lib/format';
import { reduceMotionOnce } from '../lib/motion';
import type { AnySpot, ModeKey } from '../types';

/** Ported from app.js:545-582 cardHTML, as JSX -- React owns this DOM, so no
 *  innerHTML string-building or esc() is needed here (JSX escapes by default). */
export function SpotCard({ spot, index, mode, dist, active, onPointerOver, onPointerOut, onClick, liRef }: {
  spot: AnySpot;
  index: number;
  mode: ModeKey;
  dist: number | null;
  active: boolean;
  onPointerOver: () => void;
  onPointerOut: () => void;
  onClick: () => void;
  liRef?: (el: HTMLLIElement | null) => void;
}) {
  const m = MODES[mode];
  const cat = m.categories[spot.category];
  const tier = m.tiers[String(m.tierOf(spot))];
  const where = spot.street || spot.area || 'Intramuros';
  const delay = reduceMotionOnce ? 0 : Math.min(index * 14, 340);
  const isSight = mode === 'sights';
  const isStay = mode === 'stay';
  const anchorM = DERIVED_INDEX.get(spot.id)?.anchorM ?? 0;

  let badge: string, badgeTitle: string, meta: React.ReactNode;
  if (isSight) {
    badge = spot.feeShort ?? '';
    badgeTitle = `${tier.label}${spot.feeNote ? ' — ' + spot.feeNote : ''}`;
    meta = <><b>{cat.label}</b> &middot; {spot.duration} &middot; {walkMins(anchorM)} min walk</>;
  } else if (isStay) {
    badge = tier.symbol;
    badgeTitle = `${tier.label} — ${tier.range} per night`;
    meta = <><b>{spot.rooms ? `${spot.rooms} rooms` : 'Rooms not published'}</b> &middot; {spot.priceRange}</>;
  } else {
    badge = tier.symbol;
    badgeTitle = `${tier.label} — ${tier.range} per person`;
    meta = <><b>{cat.label}</b> &middot; {(spot.cuisine || []).join(', ')}</>;
  }

  return (
    <li className="card-item" style={{ animationDelay: `${delay}ms` }} ref={liRef}>
      <button type="button" className={`card${isSight ? ' card--sight' : ''}${active ? ' is-active' : ''}`}
        style={{ '--c': cat.color } as React.CSSProperties}
        onPointerOver={onPointerOver} onPointerOut={onPointerOut} onClick={onClick}>
        <span className="card__top">
          <span className="card__name">{spot.name}</span>
          <span className="card__price" title={badgeTitle}>{badge}</span>
        </span>
        <span className="card__meta">{meta}</span>
        <span className="card__where">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14.5S13 10 13 6.4a5 5 0 0 0-10 0C3 10 8 14.5 8 14.5z" /><circle cx="8" cy="6.3" r="1.7" /></svg>
          {where}
          {dist != null && <span className="card__dist">{fmtDistance(dist)}</span>}
        </span>
      </button>
    </li>
  );
}
