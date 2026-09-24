import { useEffect, useReducer, useRef, useState } from 'react';
import { reducer, initialState } from './state/store';
import { MODES } from './data/modes';
import { useLeafletMap } from './hooks/useLeafletMap';
import { useVisibleSpots } from './hooks/useVisibleSpots';
import { useMapVisibleIds } from './hooks/useMapVisibleIds';
import { useToasts } from './hooks/useToasts';
import { Panel } from './components/Panel';
import { MapView } from './components/MapView';
import { AboutDialog } from './components/AboutDialog';
import { ChatPanel } from './components/ChatPanel';

const isMobile = () => window.matchMedia('(max-width: 760px)').matches;

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const visible = useVisibleSpots(state);
  // What the MAP shows can now be a superset of what the LIST shows -- see
  // useMapVisibleIds's own doc comment for why these are two separate hooks.
  const mapVisibleIds = useMapVisibleIds(state);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapNoteRef = useRef<HTMLDivElement>(null);
  const aboutDialogRef = useRef<HTMLDialogElement>(null);
  const viewToggleRef = useRef<HTMLButtonElement>(null);
  const beaconTimerRef = useRef<number>();

  const [sheetOpen, setSheetOpen] = useState(false);
  // Mirrors mapApi's own expandedRef for the wall-icon button's aria-pressed/
  // label and for which view the side panel shows (PLM vs Intramuros) -- the map hook owns the actual bounds/camera toggle
  // imperatively and hands back the new state on each call, so this never
  // drifts out of sync with it.
  const [intramurosExpanded, setIntramurosExpanded] = useState(false);
  const { toasts, showToast } = useToasts();

  // Reflects the active tab in the browser tab title -- useful with several
  // tabs open at once, and a cheap per-view signal for anyone skimming history.
  useEffect(() => {
    document.title = `${MODES[state.mode].label} — Intramuros Guide`;
  }, [state.mode]);

  const mapApi = useLeafletMap({
    containerRef: mapContainerRef,
    mapNoteRef,
    state,
    dispatch,
    visibleIds: mapVisibleIds,
    onToast: showToast,
    onSetSheet: setSheetOpen,
    isMobile
  });

  // Dan's "where is the change-view button?" answer: a temporary pulse + arrow
  // on the toggle. Removing the class and forcing a reflow restarts the CSS
  // animation if Dan is asked twice in a row; the timer (not animationend)
  // clears it so reduced-motion users, whose animation is flattened, still get
  // the static outline for the same few seconds.
  const highlightViewToggle = () => {
    const el = viewToggleRef.current;
    if (!el) return;
    el.classList.remove('is-beacon');
    void el.offsetWidth;
    el.classList.add('is-beacon');
    window.clearTimeout(beaconTimerRef.current);
    beaconTimerRef.current = window.setTimeout(() => el.classList.remove('is-beacon'), 6000);
  };

  // Ported from app.js:1147-1158 -- Escape cascade (picking -> directions ->
  // selection) and "/" to focus search, as long as the user isn't already typing.
  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !aboutDialogRef.current?.open) {
        if (state.dirs.picking) { mapApi.togglePicking(); return; }
        if (state.dirs.open) { mapApi.closeDirections(); return; }
        if (state.activeId) { mapApi.clearSelection(); return; }
      }
      if (e.key === '/' && !/^(INPUT|TEXTAREA)$/.test((document.activeElement as HTMLElement)?.tagName || '')) {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('.search__input')?.focus();
      }
    }
    document.addEventListener('keydown', onKeydown);
    return () => document.removeEventListener('keydown', onKeydown);
  }, [state.dirs.picking, state.dirs.open, state.activeId, mapApi]);

  return (
    <div className="app">
      <Panel state={state} dispatch={dispatch} mapApi={mapApi} visible={visible}
        sheetOpen={sheetOpen} setSheet={setSheetOpen} intramurosExpanded={intramurosExpanded}
        onAbout={() => aboutDialogRef.current?.showModal()} />
      <MapView containerRef={mapContainerRef} mapNoteRef={mapNoteRef} toggleRef={viewToggleRef} toasts={toasts}
        intramurosExpanded={intramurosExpanded}
        onToggleIntramurosView={() => setIntramurosExpanded(mapApi.toggleIntramurosView())} />
      <ChatPanel onFocus={mapApi.focusById} onHighlightViewToggle={highlightViewToggle} />
      <AboutDialog dialogRef={aboutDialogRef} />
    </div>
  );
}
