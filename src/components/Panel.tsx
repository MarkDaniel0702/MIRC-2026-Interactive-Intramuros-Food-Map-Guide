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
import { SpotCard } from './SpotCard';
import { ALL_SPOTS } from '../data/modes';
import { ALL_LANDMARKS } from '../data/destinations';
import { PLM_BOUNDARY } from '../../data/plm-boundary.js';
import { pointInRing } from '../hooks/useLeafletMap';
import type { MapApi } from '../hooks/useLeafletMap';
import type { VisibleSpot } from '../hooks/useVisibleSpots';
import type { Action, FullAppState } from '../state/store';

/** Every listed spot, from any tab, inside the PLM campus boundary -- the same
 *  point-in-polygon test the map uses to hide pins while the PLM Map is up, so
 *  the PLM view's list and its pins always agree. Fixed data, computed once. */
const PLM_RING = (PLM_BOUNDARY.geometry.coordinates[0] as [number, number][]).map(([lng, lat]) => [lat, lng] as [number, number]);
const PLM_SPOTS = ALL_SPOTS.filter(({ spot }) => pointInRing(spot.lat, spot.lng, PLM_RING));
/** The campus's other buildings -- landmarks, so a click flies to them exactly
 *  as their map marker does (focusById falls through to flyToLandmark). */
const PLM_BUILDINGS = ALL_LANDMARKS.filter(lm => lm.campus && !lm.short);

/**
 * Ported from index.html:25-168. Owns the mobile bottom-sheet drag gesture,
 * ported verbatim from app.js:1006-1041 (wireSheet) -- writes panel.style.transform
 * directly during the drag rather than through React state, per plan A6, so a
 * pointermove does not re-render the whole list on every frame.
 */
export function Panel({ state, dispatch, mapApi, visible, sheetOpen, setSheet, intramurosExpanded, onAbout }: {
  state: FullAppState;
  dispatch: Dispatch<Action>;
  mapApi: MapApi;
  visible: VisibleSpot[];
  sheetOpen: boolean;
  setSheet: (open: boolean) => void;
  /** Which map the wall-icon toggle has up: false = PLM Map (venue + on-campus
   *  spots only), true = Intramuros Map (the full tabbed browser). */
  intramurosExpanded: boolean;
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
  const gripText = !intramurosExpanded ? 'PLM Map'
    : filtered ? `${visible.length} of ${total} ${noun}` : `${total} ${noun}`;

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
        {/* Keyed on the view so a map toggle remounts the contents and replays
            .panel__view's fade-in -- SearchBox and friends re-read everything
            from `state`, so nothing is lost by the remount. */}
        <div className="panel__view" key={intramurosExpanded ? 'intramuros' : 'plm'}>
          <Masthead mode={state.mode} plm={!intramurosExpanded} />
          {intramurosExpanded ? <>
            <Tabs mode={state.mode} mapApi={mapApi} />
            <MapLayers mode={state.mode} mapModes={state.mapModes} dispatch={dispatch} />

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
          </> : <>
            <VenueBar onPick={pickLandmark} />
            <div className="controls">
              <Toolbar mapApi={mapApi} onAbout={onAbout} />
              <p className="count"><b>{PLM_SPOTS.length + PLM_BUILDINGS.length}</b> places on campus</p>
            </div>
            {/* Cards span tabs here, so a click goes through focusById (which
                switches to the spot's own tab) rather than SpotList's
                select(), which only knows the active tab's items. */}
            <ol className="list">
              {PLM_SPOTS.map(({ spot, mode }, i) => (
                <SpotCard key={spot.id} spot={spot} index={i} mode={mode} dist={null}
                  active={state.activeId === spot.id}
                  onPointerOver={() => mapApi.setPinHover(spot.id, true)}
                  onPointerOut={() => mapApi.setPinHover(spot.id, false)}
                  onClick={() => pickLandmark(spot.id)} />
              ))}
              {PLM_BUILDINGS.map((lm, i) => (
                <li key={lm.id} className="card-item" style={{ animationDelay: `${(PLM_SPOTS.length + i) * 14}ms` }}>
                  <button type="button" className="card card--building" onClick={() => pickLandmark(lm.id)}>
                    <span className="card__top"><span className="card__name">{lm.name}</span></span>
                    <span className="card__meta"><b>{lm.kind.replace('PLM campus · ', '')}</b></span>
                  </button>
                </li>
              ))}
            </ol>
          </>}

          <DirectionsPanel dirs={state.dirs} mapApi={mapApi} />
          <PanelFooter mode={state.mode} />
        </div>
      </div>
    </aside>
  );
}
