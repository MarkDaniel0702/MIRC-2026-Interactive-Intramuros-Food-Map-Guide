import { MODES } from '../data/modes';
import type { MapApi } from '../hooks/useLeafletMap';
import type { ModeKey } from '../types';

/** Ported from index.html:105-112; emptyText from app.js:536 (MODES[mode].emptyText). */
export function EmptyState({ mode, mapApi }: { mode: ModeKey; mapApi: MapApi }) {
  return (
    <div className="empty">
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M10 18h28M14 18a10 10 0 0 0 20 0M24 28v10M17 38h14" />
      </svg>
      <p className="empty__title">Nothing on the table</p>
      <p className="empty__text">{MODES[mode].emptyText}</p>
      <button type="button" className="btn btn--solid" onClick={mapApi.resetAll}>Clear all filters</button>
    </div>
  );
}
