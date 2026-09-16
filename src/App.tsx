import { useEffect, useReducer, useRef, useState } from 'react';
import { reducer, initialState } from './state/store';
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

  const [sheetOpen, setSheetOpen] = useState(false);
  const { toasts, showToast } = useToasts();

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
        sheetOpen={sheetOpen} setSheet={setSheetOpen}
        onAbout={() => aboutDialogRef.current?.showModal()} />
      <MapView containerRef={mapContainerRef} mapNoteRef={mapNoteRef} toasts={toasts} />
      <ChatPanel onFocus={mapApi.focusById} />
      <AboutDialog dialogRef={aboutDialogRef} />
    </div>
  );
}
