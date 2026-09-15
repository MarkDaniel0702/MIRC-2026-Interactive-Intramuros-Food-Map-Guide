import { useState } from 'react';
import type { MapApi } from '../hooks/useLeafletMap';

/** Ported from index.html:85-98. The #nearMe .is-busy spinner class (app.js:1111,
 *  1114, 1138) becomes local state here since React, not the hook, owns this button. */
export function Toolbar({ mapApi, onAbout }: { mapApi: MapApi; onAbout: () => void }) {
  const [locating, setLocating] = useState(false);

  async function handleNearMe() {
    setLocating(true);
    await mapApi.locateMe();
    setLocating(false);
  }

  return (
    <div className="toolbar">
      <button type="button" className={`btn${locating ? ' is-busy' : ''}`} onClick={handleNearMe}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="2.4" /><circle cx="8" cy="8" r="5.6" /><path d="M8 .8v1.8M8 13.4v1.8M.8 8h1.8M13.4 8h1.8" /></svg>
        Near me
      </button>
      <button type="button" className="btn" onClick={mapApi.resetAll}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.6 8a5.6 5.6 0 1 1-1.7-4" /><path d="M12.4 1.4v3h-3" /></svg>
        Reset
      </button>
      <button type="button" className="btn btn--ghost" onClick={onAbout}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.4" /><path d="M8 7.2v4M8 4.8v.5" /></svg>
        About
      </button>
    </div>
  );
}
