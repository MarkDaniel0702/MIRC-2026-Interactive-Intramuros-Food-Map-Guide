import type { ModeKey } from '../types';
import type { MapApi } from '../hooks/useLeafletMap';

/** Ported from index.html:44-60. Tab click routes through mapApi.selectTab, which
 *  mirrors app.js:1062-1067 (closes directions first if open, then switches mode). */
export function Tabs({ mode, mapApi }: { mode: ModeKey; mapApi: MapApi }) {
  return (
    <div className="tabs" role="tablist" aria-label="What to browse">
      <button type="button" className={`tab${mode === 'food' ? ' is-on' : ''}`} role="tab"
        aria-selected={mode === 'food'} aria-controls="list" onClick={() => mapApi.selectTab('food')}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.4 2.4v3.6a1.5 1.5 0 0 0 3 0V2.4M6.9 7.4v6.2M11.4 2.4c1.1 1.5 1.1 3.7 0 4.9v6.3" /></svg>
        Eat
      </button>
      <button type="button" className={`tab${mode === 'sights' ? ' is-on' : ''}`} role="tab"
        aria-selected={mode === 'sights'} aria-controls="list" onClick={() => mapApi.selectTab('sights')}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 13.5h12M3.4 13.5V7M6.5 13.5V7M9.5 13.5V7M12.6 13.5V7M2 6.4 8 2.6l6 3.8z" /></svg>
        See
      </button>
      <button type="button" className={`tab${mode === 'stay' ? ' is-on' : ''}`} role="tab"
        aria-selected={mode === 'stay'} aria-controls="list" onClick={() => mapApi.selectTab('stay')}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.2 12.8V4.4M2.2 8.2h11.6a2 2 0 0 1 2 2v2.6M2.2 11h13.6M5.4 6.9a1.3 1.3 0 1 0 0-.1z" /></svg>
        Stay
      </button>
    </div>
  );
}
