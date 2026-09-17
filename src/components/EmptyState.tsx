import { MODES } from '../data/modes';
import { findLandmarkByQuery } from '../data/destinations';
import type { MapApi } from '../hooks/useLeafletMap';
import type { ModeKey } from '../types';

/** Ported from index.html:105-112; emptyText from app.js:536 (MODES[mode].emptyText).
 *
 *  One addition: the search box only knows the three tabs' records, so a
 *  delegate who types "GEE" or "katipunan" -- looking for a session room, the
 *  likeliest thing to search for on the day -- would land here with nothing.
 *  When the query names a landmark, say so and offer it, rather than leaving
 *  them to guess that the campus lives on the map and not in the list. */
export function EmptyState({ mode, query, mapApi, onPickLandmark }: {
  mode: ModeKey;
  query: string;
  mapApi: MapApi;
  onPickLandmark: (id: string) => void;
}) {
  const lm = findLandmarkByQuery(query);
  return (
    <div className="empty">
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M10 18h28M14 18a10 10 0 0 0 20 0M24 28v10M17 38h14" />
      </svg>
      <p className="empty__title">Nothing on the table</p>
      <p className="empty__text">{MODES[mode].emptyText}</p>
      {lm && (
        <p className="empty__hint">
          Looking for <b>{lm.short}</b>? {lm.campus ? 'It is a building on the PLM campus' : 'It is the MIRC 2026 venue'} —
          on the map, not in this list.
        </p>
      )}
      {lm
        ? <button type="button" className="btn btn--solid" onClick={() => onPickLandmark(lm.id)}>Show {lm.short} on the map</button>
        : <button type="button" className="btn btn--solid" onClick={mapApi.resetAll}>Clear all filters</button>}
    </div>
  );
}
