import type { RefObject } from 'react';
import { LuLayers } from 'react-icons/lu';
import { Toasts } from './Toasts';
import type { ToastItem } from '../hooks/useToasts';

/** Ported from index.html:170-185. The map <div> and the note are plain refs --
 *  useLeafletMap owns both imperatively (plan A6).
 *
 *  PLM Map is the default primary view -- the wall-icon button below expands
 *  it to the original full Intramuros map by calling useLeafletMap's
 *  toggleIntramurosView, which swaps the map's real maxBounds/minZoom and
 *  which drawn boundary is showing, then flies the camera; the map container
 *  itself never changes size. */
export function MapView({ containerRef, mapNoteRef, toggleRef, toasts, intramurosExpanded, onToggleIntramurosView }: {
  containerRef: RefObject<HTMLDivElement>;
  /** The toggle button itself, so Dan can point at it (App's highlightViewToggle). */
  toggleRef: RefObject<HTMLButtonElement>;
  mapNoteRef: RefObject<HTMLDivElement>;
  toasts: ToastItem[];
  intramurosExpanded: boolean;
  onToggleIntramurosView: () => void;
}) {
  return (
    <main className="mapwrap">
      <div id="map" ref={containerRef} role="application" aria-label="Interactive map of food spots and heritage sights inside Intramuros"></div>

      {/* Icon only. Layers glyph: the same stacked-sheets icon Google/Apple Maps
          use for "switch map view", so it reads as a view switch, not a place.
          A toggle keeps one fixed name and lets aria-pressed carry the state;
          the tooltip says where a tap goes. */}
      <button type="button" className="map-wall-toggle" ref={toggleRef} aria-pressed={intramurosExpanded}
        aria-label="Full Intramuros Map"
        title={intramurosExpanded ? 'Back to the PLM Map' : 'Show the full Intramuros Map'}
        onClick={onToggleIntramurosView}>
        <LuLayers aria-hidden="true" />
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
