import { useEffect, useRef } from 'react';
import { SpotCard } from './SpotCard';
import { reduceMotionOnce } from '../lib/motion';
import type { MapApi } from '../hooks/useLeafletMap';
import type { VisibleSpot } from '../hooks/useVisibleSpots';
import type { ModeKey } from '../types';

/**
 * Ported from app.js:519-523 (the list half of render()) and app.js:657-661
 * (scrollIntoView when a pin, not a card, was clicked) and app.js:1092-1099
 * (hover lifts the matching pin).
 */
export function SpotList({ visible, mode, activeId, activeFrom, mapApi }: {
  visible: VisibleSpot[];
  mode: ModeKey;
  activeId: string | null;
  activeFrom: 'list' | 'map' | null;
  mapApi: MapApi;
}) {
  const cardRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  useEffect(() => {
    if (activeFrom !== 'map' || !activeId) return;
    cardRefs.current.get(activeId)?.scrollIntoView({ block: 'nearest', behavior: reduceMotionOnce ? 'auto' : 'smooth' });
  }, [activeId, activeFrom]);

  return (
    <ol className="list" id="list" tabIndex={-1}>
      {visible.map(({ spot, dist }, i) => (
        <SpotCard key={spot.id} spot={spot} index={i} mode={mode} dist={dist}
          active={activeId === spot.id}
          liRef={el => { if (el) cardRefs.current.set(spot.id, el); else cardRefs.current.delete(spot.id); }}
          onPointerOver={() => mapApi.setPinHover(spot.id, true)}
          onPointerOut={() => mapApi.setPinHover(spot.id, false)}
          onClick={() => mapApi.select(spot.id, { from: 'list' })} />
      ))}
    </ol>
  );
}
