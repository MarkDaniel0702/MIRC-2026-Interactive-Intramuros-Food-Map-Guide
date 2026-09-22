import type { RefObject } from 'react';
import { Toasts } from './Toasts';
import type { ToastItem } from '../hooks/useToasts';

/** Ported from index.html:170-185. The map <div> and the note are plain refs --
 *  useLeafletMap owns both imperatively (plan A6). */
export function MapView({ containerRef, mapNoteRef, toasts }: {
  containerRef: RefObject<HTMLDivElement>;
  mapNoteRef: RefObject<HTMLDivElement>;
  toasts: ToastItem[];
}) {
  return (
    <main className="mapwrap">
      <div id="map" ref={containerRef} role="application" aria-label="Interactive map of food spots and heritage sights inside Intramuros"></div>

      <div className="map-cartouche" aria-hidden="true">
        <span className="map-cartouche__rose">
          <svg viewBox="0 0 24 24"><path d="M12 1.5 14 10l8.5 2-8.5 2-2 8.5-2-8.5L1.5 12 10 10z" /><path d="M12 1.5V22.5M1.5 12h21" opacity=".35" /></svg>
        </span>
        <span className="map-cartouche__text">N</span>
      </div>

      <div className="map-note" ref={mapNoteRef}>
        <strong>Only inside the walls.</strong>
        {' '}The shaded ground is the official Intramuros boundary — every pin sits within it.
      </div>

      <Toasts toasts={toasts} />
    </main>
  );
}
