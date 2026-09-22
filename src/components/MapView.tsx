import type { RefObject } from 'react';
import { Toasts } from './Toasts';
import type { ToastItem } from '../hooks/useToasts';

/** Ported from index.html:170-185. The map <div> and the note are plain refs --
 *  useLeafletMap owns both imperatively (plan A6).
 *
 *  PLM Map is the default primary view (the .mapwrap base styles in styles.css
 *  frame #map as a small card on a gray backdrop); the wall-icon button below
 *  expands it to the original full Intramuros map by toggling the parent
 *  `.is-expanded` class the CSS transitions, while useLeafletMap's
 *  toggleIntramurosView flies the camera between the two views to match. */
export function MapView({ containerRef, mapNoteRef, toasts, intramurosExpanded, onToggleIntramurosView }: {
  containerRef: RefObject<HTMLDivElement>;
  mapNoteRef: RefObject<HTMLDivElement>;
  toasts: ToastItem[];
  intramurosExpanded: boolean;
  onToggleIntramurosView: () => void;
}) {
  return (
    <main className="mapwrap">
      <div id="map" ref={containerRef} role="application" aria-label="Interactive map of food spots and heritage sights inside Intramuros"></div>

      <button type="button" className="map-wall-toggle" aria-pressed={intramurosExpanded}
        title={intramurosExpanded ? 'Collapse to the PLM Map' : 'Expand to the full Intramuros Map'}
        onClick={onToggleIntramurosView}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M1.5 14.2V6.6h13v7.6M1.5 14.2h13M1.5 6.6V4.3h2.3v2.3M6.1 6.6V4.3h2.3v2.3M10.7 6.6V4.3h2.3v2.3" />
        </svg>
        <span>{intramurosExpanded ? 'PLM Map' : 'Intramuros Map'}</span>
      </button>

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
