import { useEffect, useRef } from 'react';
import type { Dispatch } from 'react';
import { Masthead } from './Masthead';
import { Tabs } from './Tabs';
import { MapLayers } from './MapLayers';
import { VenueBar } from './VenueBar';
import { SearchBox } from './SearchBox';
import { CategoryChips } from './CategoryChips';
import { PriceChips } from './PriceChips';
import { Toolbar } from './Toolbar';
import { Count, summarize } from './Count';
import { SpotList } from './SpotList';
import { EmptyState } from './EmptyState';
import { DirectionsPanel } from './DirectionsPanel';
import { PanelFooter } from './PanelFooter';
import type { MapApi } from '../hooks/useLeafletMap';
import type { VisibleSpot } from '../hooks/useVisibleSpots';
import type { Action, FullAppState } from '../state/store';

/**
 * Ported from index.html:25-168. Owns the mobile bottom-sheet drag gesture,
 * ported verbatim from app.js:1006-1041 (wireSheet) -- writes panel.style.transform
 * directly during the drag rather than through React state, per plan A6, so a
 * pointermove does not re-render the whole list on every frame.
 */
export function Panel({ state, dispatch, mapApi, visible, sheetOpen, setSheet, onAbout }: {
  state: FullAppState;
  dispatch: Dispatch<Action>;
  mapApi: MapApi;
  visible: VisibleSpot[];
  sheetOpen: boolean;
  setSheet: (open: boolean) => void;
  onAbout: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const gripRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const panel = panelRef.current, grip = gripRef.current;
    if (!panel || !grip) return;

    let dragging = false, startY = 0, startT = 0, moved = 0;
    const isMobile = () => window.matchMedia('(max-width: 760px)').matches;
    const maxHidden = () => Math.max(panel.offsetHeight - grip.offsetHeight, 0);

    function onDown(e: PointerEvent) {
      if (!isMobile()) return;
      dragging = true; moved = 0; startY = e.clientY;
      startT = panel!.classList.contains('is-open') ? 0 : maxHidden();
      panel!.classList.add('is-dragging');
      grip!.setPointerCapture(e.pointerId);
    }
    function onMove(e: PointerEvent) {
      if (!dragging) return;
      const dy = e.clientY - startY;
      moved = Math.max(moved, Math.abs(dy));
      panel!.style.transform = `translateY(${Math.min(Math.max(startT + dy, 0), maxHidden())}px)`;
    }
    function onEnd(e: PointerEvent) {
      if (!dragging) return;
      dragging = false;
      panel!.classList.remove('is-dragging');
      panel!.style.transform = '';
      if (moved < 6) setSheet(!panel!.classList.contains('is-open'));
      else setSheet(startT + (e.clientY - startY) < maxHidden() / 2);
    }

    grip.addEventListener('pointerdown', onDown);
    grip.addEventListener('pointermove', onMove);
    grip.addEventListener('pointerup', onEnd);
    grip.addEventListener('pointercancel', onEnd);
    return () => {
      grip.removeEventListener('pointerdown', onDown);
      grip.removeEventListener('pointermove', onMove);
      grip.removeEventListener('pointerup', onEnd);
      grip.removeEventListener('pointercancel', onEnd);
    };
  }, [setSheet]);

  const { total, filtered, noun } = summarize(state.mode, state.byMode[state.mode], visible.length);
  const gripText = filtered ? `${visible.length} of ${total} ${noun}` : `${total} ${noun}`;

  // Same as picking a list card on a phone (select() in useLeafletMap): the
  // sheet drops so the map the tap is about is actually visible.
  const pickLandmark = (id: string) => {
    mapApi.focusById(id);
    if (window.matchMedia('(max-width: 760px)').matches) setSheet(false);
  };

  return (
    <aside className={`panel${sheetOpen ? ' is-open' : ''}${state.dirs.open ? ' is-directions' : ''}`} ref={panelRef} aria-label="Places browser">
      <button className="sheet-grip" ref={gripRef} aria-expanded={sheetOpen} aria-controls="panelBody">
        <span className="sheet-grip__bar" aria-hidden="true"></span>
        <span className="sheet-grip__text">{gripText}</span>
      </button>

      <div className="panel__body" id="panelBody">
        <Masthead mode={state.mode} />
        <Tabs mode={state.mode} mapApi={mapApi} />
        <MapLayers mode={state.mode} mapModes={state.mapModes} dispatch={dispatch} />
        <VenueBar onPick={pickLandmark} />

        <div className="controls">
          <SearchBox key={`${state.mode}-${state.resetNonce}`} mode={state.mode}
            initialQuery={state.byMode[state.mode].query} dispatch={dispatch} />
          <CategoryChips mode={state.mode} cats={state.byMode[state.mode].cats} dispatch={dispatch} />
          <PriceChips mode={state.mode} tiers={state.byMode[state.mode].tiers} dispatch={dispatch} />
          <Toolbar mapApi={mapApi} onAbout={onAbout} />
          <Count mode={state.mode} filters={state.byMode[state.mode]} visibleCount={visible.length} />
        </div>

        {visible.length > 0
          ? <SpotList visible={visible} mode={state.mode} activeId={state.activeId} activeFrom={state.activeFrom} mapApi={mapApi} />
          : <EmptyState mode={state.mode} query={state.byMode[state.mode].query} mapApi={mapApi} onPickLandmark={pickLandmark} />}

        <DirectionsPanel dirs={state.dirs} mapApi={mapApi} />
        <PanelFooter mode={state.mode} />
      </div>
    </aside>
  );
}
