/**
 * The imperative map core -- one Leaflet instance owned entirely outside React's
 * render cycle (plan A6). Every method here mirrors a named function in the
 * original app.js, called out in comments, so behavior stays traceable to the
 * source it was ported from.
 *
 * Why imperative, not react-leaflet: the flyTo -> moveend -> openPopup sequencing
 * in `select()` below exists because Leaflet's autoPan measures a popup against
 * the viewport at the moment it OPENS, and a pan issued mid-flyTo is discarded
 * when the fly sets its own final centre -- opening a popup before the camera
 * settles stripped tall popups off the top of the map. React-Leaflet's <Popup>
 * opens on mount, which is exactly that failure mode. See app.js:619-638 for the
 * original writeup.
 *
 * PHASE A NOTE: `{ duration: reduceMotion ? 0 : N }` is preserved here exactly as
 * it reads in app.js, including its bug (Leaflet 1.9.4 treats 0 as falsy and
 * falls back to its own computed duration, so reduced-motion users still get a
 * full flyTo animation, and then the popup-reveal fallback timer fires before
 * moveend). Phase A is a behavior-preserving port; this is fixed in Phase B
 * (search this file for "PHASE B FIX").
 */
import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, RefObject } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';

import { INTRAMUROS_BOUNDARY } from '../../data/intramuros-boundary.js';
import { PLM_BOUNDARY } from '../../data/plm-boundary.js';
import { LANDMARKS } from '../../data/landmarks.js';
import { WALK_METRES_PER_MIN } from '../../data/tourist-spots.js';
import type { Landmark } from '../../data/types';

import { ALL_SPOTS, DERIVED_INDEX, MODES, findAnywhere } from '../data/modes';
import { ALL_LANDMARKS, findDestination } from '../data/destinations';
import type { Destination } from '../data/destinations';
import { esc } from '../lib/format';
import { PIN_SVG } from '../lib/icons';
import { landmarkPopupHTML, popupHTML, previewHTML } from '../lib/popupHtml';
import { matches } from '../lib/filter';
import { haversine, fmtDistance } from '../lib/format';
import { route as routeRequest, distanceToLine } from '../lib/routing';
import { reduceMotionOnce } from '../lib/motion';
import type { Action, FullAppState, LiveProgress } from '../state/store';
import type { AnySpot, LatLng, ModeKey } from '../types';

const CAMPUS_MIN_ZOOM = 17;
/** The map's own minZoom (creation option, restored whenever the wall-icon
 *  toggle expands to the full Intramuros view). */
const INTRAMUROS_MIN_ZOOM = 14;

/**
 * PHASE B FIX (plan B1): app.js used `{ duration: reduceMotion ? 0 : N }`
 * everywhere. Leaflet 1.9.4 treats `duration: 0` as falsy and falls back to its
 * own computed duration, so reduced-motion users still got a full flyTo
 * animation -- and the 60ms popup-reveal fallback timer then fired before
 * moveend, reintroducing the exact off-screen-popup bug the moveend sequencing
 * exists to prevent (see the big comment on `select` below). `animate: false`
 * is the form that actually disables the animation.
 */
function flyOptions(duration: number): L.ZoomPanOptions {
  return reduceMotionOnce ? { animate: false } : { duration };
}

/** Standard ray-casting point-in-polygon, mirroring
 *  tools/verify-in-intramuros.mjs's own build-time check -- `ring` here is
 *  this file's own [lat, lng] pair convention rather than GeoJSON's
 *  [lng, lat], so x/y below are lng/lat respectively, swapped to match. */
export function pointInRing(lat: number, lng: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][0], xi = ring[i][1];
    const yj = ring[j][0], xj = ring[j][1];
    const straddles = (yi > lat) !== (yj > lat);
    if (straddles && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Caps a popup's height to the map's own visible size, so content taller than
 * the viewport scrolls internally instead of overflowing off-screen, then
 * clamps the popup element's own on-screen position to stay fully within the
 * map's viewport. Deliberately not Leaflet's own `autoPan` (every popup in
 * this file binds `autoPan: false`): autoPan pans the *camera*, animated over
 * several frames, and this app already has its own camera movement competing
 * for the same frames (`select`/`flyToLandmark`'s own flyTo, or the PLM Map's
 * maxBounds simply refusing a pan that would leave its campus enclosure).
 * Measuring mid-pan and correcting for that instant, only for the pan to keep
 * going afterward, over- or under-shot the popup on every version of this fix
 * that tried to run after or alongside autoPan. Moving the popup element
 * itself is immediate, synchronous, and never competes with anything, as long
 * as it runs against a camera that has already settled -- which is why this
 * is a function called explicitly wherever that is true, not just logic
 * inlined into the map's 'popupopen' listener: `flyToLandmark`'s own reveal
 * re-opens a popup that is already open (from the marker's native click,
 * before its flyTo even started), and Leaflet's own openOn is a no-op for a
 * popup already on the map, so 'popupopen' never fires a second time once
 * that flyTo actually lands -- this needs calling again there explicitly.
 */
function fitPopup(map: L.Map, popup: L.Popup) {
  popup.options.maxHeight = Math.max(160, map.getSize().y - 64);
  popup.update();
  const container = popup.getElement();
  if (!container) return;
  const rect = container.getBoundingClientRect();
  const mapRect = map.getContainer().getBoundingClientRect();
  const margin = 10;
  let dx = 0;
  if (rect.left < mapRect.left + margin) dx = (mapRect.left + margin) - rect.left;
  else if (rect.right > mapRect.right - margin) dx = (mapRect.right - margin) - rect.right;
  let dy = 0;
  if (rect.top < mapRect.top + margin) dy = (mapRect.top + margin) - rect.top;
  else if (rect.bottom > mapRect.bottom - margin) dy = (mapRect.bottom - margin) - rect.bottom;
  if (!dx && !dy) return;
  // Leaflet's own setPosition wrote a translate3d(...) base onto this same
  // property for the popup's real anchor point; append to it rather than
  // replace it, so this stays anchored to that real point.
  container.style.transform = `${container.style.transform} translate(${dx}px, ${dy}px)`;
}

export interface MapApi {
  selectTab: (mode: ModeKey) => void;
  select: (id: string, opts: { from: 'list' | 'map' }) => void;
  openDirections: (id: string) => void;
  closeDirections: () => void;
  setStart: (point: LatLng & { id: string; name: string }) => void;
  useMyLocationForDirections: () => void;
  togglePicking: () => void;
  /** Starts or stops watchPosition-driven live tracking for the open route --
   *  moves the "me" marker on every fix, updates distance/ETA/direction, and
   *  recalculates the route if the fix strays far enough off it. */
  toggleLiveTracking: () => void;
  locateMe: () => Promise<void>;
  resetAll: () => void;
  /** Ported from app.js:1092-1099 -- hovering a list card lifts its pin. */
  setPinHover: (id: string, hover: boolean) => void;
  /** Ported from app.js:1151, the Escape-key deselect branch. Distinct from the
   *  map's own background-click deselect (app.js:1166), which does not need this:
   *  Leaflet closes a popup on any map click by default, but not on a keypress. */
  clearSelection: () => void;
  /** Chat-driven navigation: fly to and open the popup for any spot by id, across
   *  whichever mode it belongs to -- unlike `select`, not limited to the tab
   *  currently open -- or for a landmark (the PLM campus and its buildings).
   *  Returns false immediately if the id names neither, which the caller
   *  (ChatPanel) uses to say so rather than silently do nothing. */
  focusById: (id: string) => boolean;
  /** Wall-icon toggle: PLM Map (the default, its own restricted campus
   *  enclosure) <-> the full Intramuros Map (its existing restricted
   *  enclosure, unchanged). The new state arrives via onViewChange. */
  toggleIntramurosView: () => void;
}

interface UseLeafletMapParams {
  containerRef: RefObject<HTMLDivElement>;
  mapNoteRef: RefObject<HTMLDivElement>;
  state: FullAppState;
  dispatch: Dispatch<Action>;
  visibleIds: string[];
  onToast: (text: string) => void;
  onSetSheet: (open: boolean) => void;
  isMobile: () => boolean;
  /** Fires whenever the view flips -- from the toggle, or on its own when
   *  something outside the campus has to be shown (see setView). */
  onViewChange: (intramurosExpanded: boolean) => void;
}

export function useLeafletMap(params: UseLeafletMapParams): MapApi {
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const startMarkerRef = useRef<L.Marker | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const meMarkerRef = useRef<L.Marker | null>(null);
  /** Live route tracking (new -- not a port of any app.js behavior). watchIdRef
   *  is the browser's watchPosition handle; lastLiveDistanceRef remembers the
   *  previous fix's distance-to-destination so each new fix can say "closer" or
   *  "farther" without that living in render state; lastRecalcAtRef throttles
   *  how often straying off-route is allowed to trigger a fresh OSRM call. */
  const watchIdRef = useRef<number | null>(null);
  const lastLiveDistanceRef = useRef<number | null>(null);
  const lastRecalcAtRef = useRef<number>(0);
  const homeRef = useRef<{ bounds: L.LatLngBounds; options: L.FitBoundsOptions } | null>(null);
  /** The PLM-campus camera target -- the 'plm' landmark's own centre/zoom,
   *  same framing flyToLandmark already uses for a click on that marker. */
  const campusHomeRef = useRef<{ center: L.LatLngExpression; zoom: number } | null>(null);
  /** The two panning enclosures the wall-icon toggle swaps between via
   *  map.setMaxBounds -- a real geographic restriction (drag/swipe clamps at
   *  its edge, same maxBoundsViscosity rubber-band both share), not just a
   *  difference in how far the camera happens to be zoomed.
   *  intramurosMaxBoundsRef mirrors the map's own creation-time maxBounds so
   *  toggling back to it is exact. */
  const campusMaxBoundsRef = useRef<L.LatLngBounds | null>(null);
  const intramurosMaxBoundsRef = useRef<L.LatLngBounds | null>(null);
  /** The drawn PLM-campus boundary -- shade outside, tint inside, dashed gold
   *  line on the edge, the same treatment the Intramuros walls get below --
   *  shown only while the PLM Map is primary (removeLayer/addTo, not a CSS
   *  visibility toggle, since it's real Leaflet polygons sharing the map's
   *  own coordinate space). */
  const campusMaskRef = useRef<L.LayerGroup | null>(null);
  /** The PLM boundary ring itself ([lat, lng] pairs), kept apart from the
   *  drawn campusMask so the cluster-sync effect below can point-in-polygon
   *  test every spot against it -- hiding pins outside the PLM area while
   *  its map is primary, the same way the drawn boundary already implies. */
  const plmRingRef = useRef<[number, number][] | null>(null);
  /** true once the wall-icon toggle has expanded to the full Intramuros view;
   *  false (the default) means the PLM campus view is primary. Read by
   *  refitHome/resetAll/closeDirections so "go home" always means "go back to
   *  whichever of the two views is currently primary", not always Intramuros. */
  const expandedRef = useRef(false);
  const firstPaintRef = useRef(!reduceMotionOnce);
  const pendingSelectRef = useRef<string | null>(null);
  const activePinIdRef = useRef<string | null>(null);
  /** Set by focusById when the target spot's mode/filters had to change first --
   *  a marker only joins the cluster (and so becomes flyTo/popup-able) once the
   *  visibleIds-sync effect below has run against the new state. Resolved there,
   *  the same deferred-until-ready shape pendingSelectRef already uses for the
   *  moveend race, just gated on cluster membership instead of camera movement. */
  const pendingFocusRef = useRef<string | null>(null);
  /** Landmark markers by id -- kept apart from markersRef, whose entries are
   *  clustered spot pins that select()/setActive expect. */
  const landmarkMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const pendingLandmarkRef = useRef<string | null>(null);

  // Live mirrors so the stable callbacks below always see fresh values -- the
  // same thing app.js gets for free by closing over one mutable `state` object.
  const stateRef = useRef(params.state);
  useEffect(() => { stateRef.current = params.state; }, [params.state]);
  const dispatchRef = useRef(params.dispatch);
  dispatchRef.current = params.dispatch;
  const onToastRef = useRef(params.onToast);
  onToastRef.current = params.onToast;
  const onSetSheetRef = useRef(params.onSetSheet);
  onSetSheetRef.current = params.onSetSheet;
  const isMobileRef = useRef(params.isMobile);
  isMobileRef.current = params.isMobile;
  const onViewChangeRef = useRef(params.onViewChange);
  onViewChangeRef.current = params.onViewChange;
  /** So toggleIntramurosView (a stable, deps-free callback) can re-run the
   *  cluster's PLM-boundary filter immediately on click, without waiting for
   *  the visibleIds effect below to fire on some unrelated change. */
  const visibleIdsRef = useRef(params.visibleIds);
  visibleIdsRef.current = params.visibleIds;

  const hideMapNoteNow = useCallback(() => {
    params.mapNoteRef.current?.classList.add('is-hidden');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const showMapNoteNow = useCallback(() => {
    params.mapNoteRef.current?.classList.remove('is-hidden');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pinEl(id: string): HTMLElement | null {
    const el = markersRef.current.get(id)?.getElement();
    return el ? (el.querySelector('.pin') as HTMLElement | null) : null;
  }

  /** The spot markers the cluster should actually show right now: every id in
   *  `ids` that has a marker, minus (while the PLM Map is primary) whichever
   *  of those sit outside the PLM boundary -- "hide outside PLM, keep the
   *  system's own data untouched" is exactly a display filter here, nothing
   *  is removed from markersRef. Expanded to Intramuros, every id in `ids`
   *  passes through unfiltered, same as before this existed. */
  function computeClusterLayers(ids: string[]): L.Marker[] {
    const ring = plmRingRef.current;
    const inPlmView = !expandedRef.current && ring;
    return ids
      .filter(id => {
        if (!inPlmView) return true;
        const marker = markersRef.current.get(id);
        if (!marker) return false;
        const { lat, lng } = marker.getLatLng();
        return pointInRing(lat, lng, ring);
      })
      .map(id => markersRef.current.get(id))
      .filter((l): l is L.Marker => Boolean(l));
  }

  /** Ported from app.js:591-601 setActive -- the single place a pin's .is-active
   *  DOM class changes, paired with the React-state dispatch every call site needs. */
  const setActive = useCallback((id: string | null, from: 'list' | 'map' | null = null) => {
    const prev = activePinIdRef.current;
    if (prev) pinEl(prev)?.classList.remove('is-active');
    activePinIdRef.current = id;
    if (id) pinEl(id)?.classList.add('is-active');
    dispatchRef.current({ type: 'SET_ACTIVE', id, from });
  }, []);

  /** The destination pin's face. A spot gets its category glyph in the
   *  category's colour; a landmark gets its short label (PLM, JAA, GK …) -- the
   *  same mark its own marker shows, so the two read as one place -- on the
   *  pin's default gold, since a landmark has no category. */
  function destPinHTML(dest: Destination): string {
    if (dest.kind === 'landmark') {
      return `<div class="dest-pin dest-pin--landmark"><span class="dest-pin__disc">${dest.landmark.glyph ? PIN_SVG(dest.landmark.glyph) : esc(dest.landmark.short ?? '★')}</span></div>`;
    }
    const cat = MODES[dest.modeKey].categories[dest.spot.category];
    return `<div class="dest-pin" style="--c:${cat.color}"><span class="dest-pin__disc">${PIN_SVG(cat.icon)}</span></div>`;
  }

  function showDestinationNow(dest: Destination) {
    const map = mapRef.current;
    if (!map) return;
    if (destMarkerRef.current) map.removeLayer(destMarkerRef.current);
    destMarkerRef.current = L.marker([dest.lat, dest.lng], {
      icon: L.divIcon({
        className: 'dest-icon',
        html: destPinHTML(dest),
        iconSize: [38, 38],
        iconAnchor: [19, 42]
      }),
      interactive: false,
      zIndexOffset: 1200,
      title: dest.name
    }).addTo(map);
  }

  function hideDestinationNow() {
    const map = mapRef.current;
    if (destMarkerRef.current && map) {
      map.removeLayer(destMarkerRef.current);
      destMarkerRef.current = null;
    }
  }

  /** Fly in on a landmark and open its popup once the camera settles -- the
   *  landmark marker's own click behaviour, factored out so chat can trigger it
   *  too (focusById). PHASE B FIX (plan B2): app.js:333-336 opened this popup
   *  synchronously right after calling flyTo, the original version of the exact
   *  bug select()'s moveend sequencing (below) exists to prevent -- it just never
   *  showed up here because landmark popups are short. Sequenced the same way,
   *  including the pending-id guard for a rapid click on a second landmark. The
   *  sequencing matters doubly for a campus marker: it is not even on the map
   *  until the zoom crosses CAMPUS_MIN_ZOOM (syncCampus, on zoomend), and
   *  marker.openPopup() is a silent no-op for a marker that is off the map.
   *  That is exactly the state the fallback timer can find if the flight was
   *  interrupted or stalled (a background tab throttles the animation frames
   *  but not the timer), so the fallback opens the popup on the map itself,
   *  which does not need its marker present. */
  const flyToLandmark = useCallback((id: string): boolean => {
    const map = mapRef.current;
    const marker = landmarkMarkersRef.current.get(id);
    if (!map || !marker) return false;
    // The campus lands at 18, where all four buildings fit in view. A building
    // lands a half-step closer: GEE and GA are 18 m apart, which is two 30px
    // markers exactly touching at 18 and clearly separate at 18.5 -- and
    // asking for one building means wanting to tell it from its neighbour.
    const lm = ALL_LANDMARKS.find(l => l.id === id);
    map.flyTo(marker.getLatLng(), lm?.campus ? 18.5 : 18, flyOptions(0.8));
    pendingLandmarkRef.current = id;
    let revealT: ReturnType<typeof setTimeout>;
    const reveal = () => {
      map.off('moveend', reveal);
      clearTimeout(revealT);
      if (pendingLandmarkRef.current !== id) return;
      pendingLandmarkRef.current = null;
      const popup = marker.getPopup();
      if (map.hasLayer(marker) || !popup) marker.openPopup();
      else {
        popup.setLatLng(marker.getLatLng());
        map.openPopup(popup);
      }
      // Re-opening an already-open popup (the common case: the marker's own
      // native click already opened it, before this flyTo even started) does
      // not refire the map's 'popupopen' -- Leaflet's openOn only adds a
      // layer that is not already on the map -- so fitPopup (see its own doc
      // comment) needs calling explicitly here, now that the camera has
      // actually settled, in both branches above.
      if (popup) fitPopup(map, popup);
    };
    map.on('moveend', reveal);
    revealT = setTimeout(reveal, reduceMotionOnce ? 60 : 1200);
    return true;
  }, []);

  /** Ported from app.js:608-663 select. */
  const select = useCallback((id: string, opts: { from: 'list' | 'map' }) => {
    const map = mapRef.current;
    if (!map) return;
    // Mode-agnostic on purpose: since the map can now show pins from every
    // toggled-on mode at once (mapModes), a pin click no longer implies the
    // clicked spot belongs to whichever tab happens to be open. A from:'list'
    // call is still always same-mode in practice -- SpotList only ever renders
    // the active tab's own cards -- so this is a no-op change for that path.
    const found = findAnywhere(id);
    const marker = markersRef.current.get(id);
    if (!found || !marker) return;
    const { spot, modeKey } = found;

    if (modeKey !== stateRef.current.mode) {
      dispatchRef.current({ type: 'SET_MODE', mode: modeKey });
    }
    setActive(id, opts.from);
    hideMapNoteNow();

    if (opts.from === 'list') {
      if (isMobileRef.current()) onSetSheetRef.current(false);

      map.closePopup();
      // PHASE B (plan B3/B4): shortened from 0.7s -- this fires on every list-card
      // click, so it is the flight users feel most often; snappier reads as more
      // responsive without being abrupt.
      map.flyTo([spot.lat, spot.lng], 18, flyOptions(0.55));

      pendingSelectRef.current = id;
      let revealT: ReturnType<typeof setTimeout>;
      const reveal = () => {
        map.off('moveend', reveal);
        clearTimeout(revealT);
        if (pendingSelectRef.current !== id) return; // superseded by a newer selection
        pendingSelectRef.current = null;
        setActive(id, opts.from);

        // @types/leaflet has no (popup, latlng, options) overload, only
        // (popup) and (content, latlng, options) -- reposition first and call
        // the supported one. autoPanPadding is already on the popup's own
        // bind-time options (buildMarker below), so nothing is lost.
        const popup = marker.getPopup();
        if (popup) {
          popup.setLatLng([spot.lat, spot.lng]);
          map.openPopup(popup);
        }
      };
      map.on('moveend', reveal);
      // PHASE B (plan B4): the fallback only ever fires when moveend does not
      // (target already centred, or an interrupted animation) -- 1200ms was
      // calibrated against the old 0.7s flight; scaled down to match the
      // shorter one above, still comfortably longer than the flight itself.
      revealT = setTimeout(reveal, reduceMotionOnce ? 60 : 900);
    }
    // from === 'map': the corresponding card's scrollIntoView is handled by
    // SpotList, which watches activeId+activeFrom.
  }, [setActive, hideMapNoteNow]);

  /** Ported from app.js:725-747 setMode (the map/state half; DOM chrome is now
   *  reactive JSX driven by the `mode` field this dispatches). */
  const setModeInternal = useCallback((next: ModeKey) => {
    if (next === stateRef.current.mode) return;
    setActive(null);
    mapRef.current?.closePopup();
    dispatchRef.current({ type: 'SET_MODE', mode: next });
  }, [setActive]);

  /** Ported from app.js:1062-1067, the tab branch of the document click delegate. */
  const selectTab = useCallback((next: ModeKey) => {
    if (stateRef.current.dirs.open) closeDirectionsInternal();
    setModeInternal(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setModeInternal]);

  /** Ported from app.js:878-892 runRoute. Accepts overrides because a caller that
   *  just dispatched a state change (setStart, openDirections) cannot rely on
   *  stateRef -- it only mirrors state AFTER the next render commits. */
  const runRoute = useCallback(async (overrides?: { destId?: string; start?: LatLng & { id: string; name: string } }) => {
    const s = stateRef.current;
    const destId = overrides?.destId ?? s.dirs.destId;
    const from = overrides?.start ?? s.dirs.start;
    if (!destId || !from || s.dirs.busy) return;
    const dest = findDestination(destId);
    if (!dest) return;

    dispatchRef.current({ type: 'DIRS_SET_BUSY', busy: true });
    dispatchRef.current({ type: 'DIRS_SET_MESSAGE', message: { text: 'Finding a walking route…', kind: 'busy' } });

    const res = await routeRequest(from, { lat: dest.lat, lng: dest.lng }, dest.name);

    dispatchRef.current({ type: 'DIRS_SET_BUSY', busy: false });
    dispatchRef.current({
      type: 'DIRS_SET_MESSAGE',
      message: res.fallback
        ? {
            text: res.reason === 'timeout'
              ? 'The routing service did not answer in time — showing a direct line and an estimate instead.'
              : 'The routing service is unavailable — showing a direct line and an estimate instead.',
            kind: 'warn'
          }
        : null
    });
    dispatchRef.current({ type: 'DIRS_SET_RESULT', result: res });
  }, []);

  /** Ported from app.js:870-876 setStart. */
  const setStart = useCallback((point: LatLng & { id: string; name: string }) => {
    dispatchRef.current({ type: 'DIRS_SET_START', start: point });
    runRoute({ start: point });
  }, [runRoute]);

  /** Ported from app.js:819-845 openDirections. Resolves through findDestination
   *  rather than findAnywhere so a landmark -- the PLM campus, its buildings and
   *  halls -- is as valid a destination as any listed spot. The one difference: a
   *  landmark belongs to no tab, so DIRS_OPEN is told not to switch one (mode:
   *  null) and the tab you were browsing is still there when you come back. */
  const openDirections = useCallback((id: string) => {
    const map = mapRef.current;
    if (!map) return;
    const dest = findDestination(id);
    if (!dest) return;

    dispatchRef.current({ type: 'DIRS_OPEN', destId: id, mode: dest.kind === 'spot' ? dest.modeKey : null });
    // For a landmark there is no clustered pin to mark .is-active (pinEl finds
    // nothing and setActive skips the class); the destination marker below is
    // what shows where you are walking to.
    setActive(id);
    showDestinationNow(dest);
    map.closePopup();
    if (isMobileRef.current()) onSetSheetRef.current(true);

    const currentStart = stateRef.current.dirs.start;
    if (currentStart) {
      runRoute({ destId: id, start: currentStart });
    } else {
      map.flyTo([dest.lat, dest.lng], 17, flyOptions(0.7));
    }
  }, [setActive, runRoute]);

  /** Ported from app.js:978-982 stopPicking. */
  const stopPicking = useCallback(() => {
    dispatchRef.current({ type: 'DIRS_SET_PICKING', picking: false });
    document.body.classList.remove('is-picking');
  }, []);

  /** Ported from app.js:970-976 startPicking. */
  const startPicking = useCallback(() => {
    dispatchRef.current({ type: 'DIRS_SET_PICKING', picking: true });
    document.body.classList.add('is-picking');
    dispatchRef.current({ type: 'DIRS_SET_MESSAGE', message: { text: 'Tap anywhere on the map to set your starting point.', kind: 'busy' } });
    if (isMobileRef.current()) onSetSheetRef.current(false);
  }, []);

  /** Ported from app.js:990-992, the #dirsPickOnMap click handler. */
  const togglePicking = useCallback(() => {
    if (stateRef.current.dirs.picking) {
      stopPicking();
      dispatchRef.current({ type: 'DIRS_SET_MESSAGE', message: null });
    } else {
      startPicking();
    }
  }, [startPicking, stopPicking]);

  /* ── live route tracking -- new, not a port of any app.js behavior ─────────── */

  /** How far off the plotted route a live fix has to land before it is worth a
   *  fresh one, rather than noise from GPS drift between Intramuros' narrow
   *  streets. */
  const OFF_ROUTE_METRES = 35;
  /** Floor between two automatic recalculations, so weaving near the threshold
   *  cannot fire an OSRM request every few seconds. */
  const RECALC_COOLDOWN_MS = 20000;
  /** Close enough to the destination that "keep walking" stops being useful. */
  const ARRIVED_METRES = 15;
  /** Smaller than this, two consecutive fixes read as "steady" rather than
   *  flipping the closer/farther indicator on ordinary GPS jitter. */
  const PROGRESS_DEADBAND_METRES = 5;

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation?.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    lastLiveDistanceRef.current = null;
    dispatchRef.current({ type: 'DIRS_SET_TRACKING', tracking: false });
  }, []);

  /** Runs on every fix while tracking is on: moves the "me" marker and
   *  recomputes distance/ETA/direction locally (no network) on every one, but
   *  only asks `runRoute` for a fresh route when the walker has actually
   *  strayed off the plotted line -- not merely moved along it. */
  const onTrackingFix = useCallback((pos: GeolocationPosition) => {
    const map = mapRef.current;
    const { latitude: lat, longitude: lng, accuracy } = pos.coords;
    const s = stateRef.current;
    const dest = s.dirs.destId ? findDestination(s.dirs.destId) : null;
    if (!dest) return;

    dispatchRef.current({ type: 'SET_USER_POS', pos: { lat, lng } });

    if (map) {
      if (meMarkerRef.current) {
        meMarkerRef.current.setLatLng([lat, lng]);
      } else {
        meMarkerRef.current = L.marker([lat, lng], {
          icon: L.divIcon({ className: 'me-icon', html: '<div class="me"></div>', iconSize: [16, 16] }),
          interactive: false,
          zIndexOffset: 1000
        }).addTo(map);
      }
    }

    const distanceRemaining = haversine(lat, lng, dest.lat, dest.lng);
    const prev = lastLiveDistanceRef.current;
    const direction: LiveProgress['direction'] =
      prev == null || Math.abs(distanceRemaining - prev) < PROGRESS_DEADBAND_METRES ? 'steady'
        : distanceRemaining < prev ? 'closer' : 'farther';
    lastLiveDistanceRef.current = distanceRemaining;

    dispatchRef.current({
      type: 'DIRS_SET_LIVE',
      live: {
        distanceRemaining,
        etaMins: Math.max(0, Math.round(distanceRemaining / WALK_METRES_PER_MIN)),
        direction,
        accuracy: Number.isFinite(accuracy) ? accuracy : null
      }
    });

    if (distanceRemaining <= ARRIVED_METRES) {
      stopTracking();
      dispatchRef.current({ type: 'DIRS_SET_MESSAGE', message: { text: `You've arrived at ${dest.name}.`, kind: 'busy' } });
      return;
    }

    // Only ever measured against a real OSRM line -- the straight-line fallback
    // IS the direct line to the destination, so "off" it is meaningless, and a
    // recalculation already in flight (busy) must not be asked for a second one.
    const result = s.dirs.result;
    if (!result || result.fallback || s.dirs.busy) return;
    if (distanceToLine({ lat, lng }, result.line) <= OFF_ROUTE_METRES) return;
    const now = Date.now();
    if (now - lastRecalcAtRef.current < RECALC_COOLDOWN_MS) return;
    lastRecalcAtRef.current = now;

    const point = { lat, lng, name: 'your location', id: '__me' };
    dispatchRef.current({ type: 'DIRS_SET_START', start: point });
    runRoute({ start: point });
  }, [runRoute, stopTracking]);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      dispatchRef.current({ type: 'DIRS_SET_MESSAGE', message: { text: 'This browser cannot share your location live. Pick a starting point below instead.', kind: 'warn' } });
      return;
    }
    if (!stateRef.current.dirs.destId) return;

    dispatchRef.current({ type: 'DIRS_SET_TRACKING', tracking: true });
    dispatchRef.current({ type: 'DIRS_SET_MESSAGE', message: { text: 'Getting your live location…', kind: 'busy' } });
    lastLiveDistanceRef.current = null;
    lastRecalcAtRef.current = 0;

    watchIdRef.current = navigator.geolocation.watchPosition(
      pos => {
        // A fix arrived, so "Getting your live location…" and any earlier GPS
        // warning are both stale now; onTrackingFix sets its own (e.g. on
        // arrival) after this, so clearing first cannot clobber it.
        if (stateRef.current.dirs.message) {
          dispatchRef.current({ type: 'DIRS_SET_MESSAGE', message: null });
        }
        onTrackingFix(pos);
      },
      err => {
        if (err.code === err.PERMISSION_DENIED) {
          stopTracking();
          dispatchRef.current({ type: 'DIRS_SET_MESSAGE', message: { text: 'Location permission was denied, so live tracking has stopped.', kind: 'warn' } });
          return;
        }
        // Transient (unavailable fix, timeout): keep the watch running: the
        // next fix may simply arrive late, especially indoors or between tall
        // buildings, and dropping tracking on every blip would be worse than
        // a stale one going quiet for a few seconds.
        dispatchRef.current({
          type: 'DIRS_SET_MESSAGE',
          message: {
            text: err.code === err.TIMEOUT
              ? 'Waiting for a GPS fix — this can take longer indoors or between tall buildings.'
              : 'Could not get your location just now — still trying.',
            kind: 'warn'
          }
        });
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );
  }, [onTrackingFix, stopTracking]);

  const toggleLiveTracking = useCallback(() => {
    if (stateRef.current.dirs.tracking) stopTracking(); else startTracking();
  }, [startTracking, stopTracking]);

  /** Flies to whichever of the two primary views (PLM campus or full
   *  Intramuros) is currently showing -- shared by resetAll and
   *  closeDirections so neither one fights the wall-icon toggle by forcing
   *  the camera to Intramuros regardless of what the visitor last chose. */
  const flyToPrimaryHome = useCallback((duration: number) => {
    const map = mapRef.current;
    if (!map) return;
    if (expandedRef.current) {
      if (!homeRef.current) return;
      map.flyToBounds(homeRef.current.bounds, { ...homeRef.current.options, ...flyOptions(duration) });
    } else if (campusHomeRef.current) {
      map.flyTo(campusHomeRef.current.center, campusHomeRef.current.zoom, flyOptions(duration));
    }
  }, []);

  /** Ported from app.js:847-861 closeDirections. */
  const closeDirectionsInternal = useCallback(() => {
    const map = mapRef.current;
    if (!map || !homeRef.current) return;
    stopTracking();
    dispatchRef.current({ type: 'DIRS_CLOSE' });
    stopPicking();
    routeLayerRef.current?.clearLayers();
    if (startMarkerRef.current) { map.removeLayer(startMarkerRef.current); startMarkerRef.current = null; }
    hideDestinationNow();
    setActive(null);
    flyToPrimaryHome(0.7);
  }, [flyToPrimaryHome, setActive, stopPicking, stopTracking]);

  /** Ported from app.js:947-968 useMyLocation (the directions-panel variant --
   *  distinct from locateMe/#nearMe below). */
  const useMyLocationForDirections = useCallback(() => {
    if (!navigator.geolocation) {
      dispatchRef.current({ type: 'DIRS_SET_MESSAGE', message: { text: 'This browser cannot share your location. Pick a starting point below instead.', kind: 'warn' } });
      return;
    }
    dispatchRef.current({ type: 'DIRS_SET_MESSAGE', message: { text: 'Getting your location…', kind: 'busy' } });
    navigator.geolocation.getCurrentPosition(
      pos => {
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude, name: 'your location', id: '__me' };
        dispatchRef.current({ type: 'SET_USER_POS', pos: { lat: point.lat, lng: point.lng } });
        setStart(point);
      },
      err => {
        dispatchRef.current({
          type: 'DIRS_SET_MESSAGE',
          message: {
            text: err.code === err.PERMISSION_DENIED
              ? 'Location permission was denied. Tap a point on the map, or pick a starting point below.'
              : 'Could not get your location. Tap a point on the map, or pick a starting point below.',
            kind: 'warn'
          }
        });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, [setStart]);

  /** Ported from app.js:1106-1145, the #nearMe click handler. Returns a Promise
   *  purely so the Toolbar component can manage its own busy-spinner state around
   *  it -- app.js did that with `this.classList`, which React doesn't own here. */
  const locateMe = useCallback((): Promise<void> => new Promise(resolve => {
    if (!navigator.geolocation) {
      onToastRef.current('This browser cannot share your location.');
      resolve();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        dispatchRef.current({ type: 'SET_USER_POS', pos: { lat, lng } });

        const map = mapRef.current;
        if (map) {
          if (meMarkerRef.current) map.removeLayer(meMarkerRef.current);
          meMarkerRef.current = L.marker([lat, lng], {
            icon: L.divIcon({ className: 'me-icon', html: '<div class="me"></div>', iconSize: [16, 16] }),
            interactive: false,
            zIndexOffset: 1000
          }).addTo(map);
        }

        // Recompute "nearest" locally rather than reading a memoized value from
        // outside this hook, which cannot be relied on to reflect this tick.
        const s = stateRef.current;
        const m = MODES[s.mode];
        const f = s.byMode[s.mode];
        let nearest: { spot: AnySpot; dist: number } | null = null;
        for (const sp of m.items) {
          if (!matches(sp, m, f)) continue;
          const dist = haversine(lat, lng, sp.lat, sp.lng);
          if (!nearest || dist < nearest.dist) nearest = { spot: sp, dist };
        }
        onToastRef.current(nearest
          ? `Sorted by distance. Nearest: ${nearest.spot.name}, ${fmtDistance(nearest.dist)} away.`
          : 'Location found, but no spots match your filters.');

        if (homeRef.current?.bounds.contains([lat, lng])) {
          showOffCampus(L.latLng(lat, lng));
          map?.flyTo([lat, lng], 17, flyOptions(0.9));
        } else {
          onToastRef.current('You are outside Intramuros — the list is sorted by distance from you.');
        }
        resolve();
      },
      err => {
        onToastRef.current(err.code === err.PERMISSION_DENIED
          ? 'Location permission denied.'
          : 'Could not get your location. (Geolocation needs https or localhost.)');
        resolve();
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }), []);

  /** Ported from app.js:761-774 resetAll. */
  const resetAll = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    setActive(null);
    map.closePopup();
    dispatchRef.current({ type: 'RESET_FILTERS' });
    flyToPrimaryHome(0.8);
    showMapNoteNow();
  }, [flyToPrimaryHome, setActive, showMapNoteNow]);

  /* ────────────────────────── mount: build the map once ────────────────────── */

  useEffect(() => {
    const container = params.containerRef.current;
    if (!container) return;

    // The boundary is a Polygon: coordinates[0] is its outer ring.
    const outerRing = INTRAMUROS_BOUNDARY.geometry.coordinates[0] as [number, number][];
    const ring = outerRing.map(([lng, lat]) => [lat, lng] as [number, number]);
    const bounds = L.latLngBounds(ring);

    const intramurosMaxBounds = bounds.pad(0.6);
    intramurosMaxBoundsRef.current = intramurosMaxBounds;

    const map = L.map(container, {
      zoomControl: false,
      minZoom: INTRAMUROS_MIN_ZOOM,
      maxZoom: 19,
      zoomSnap: 0.5,
      maxBounds: intramurosMaxBounds,
      // PHASE B (plan B3): app.js used every one of these at Leaflet's default,
      // which is what made panning feel heavy and the edges feel sticky --
      // nothing here was ever explicitly tuned. Lower viscosity gives less
      // rubber-band resistance at the bounds edge; lower inertiaDeceleration
      // lets a drag-release glide continue further before it settles, instead
      // of stopping abruptly (default 3400).
      maxBoundsViscosity: 0.6,
      inertiaDeceleration: 2200,
      attributionControl: true
    });
    mapRef.current = map;

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    L.control.zoom({ position: 'topleft' }).addTo(map);

    L.polygon(
      [[[-89.9, -179.9], [-89.9, 179.9], [89.9, 179.9], [89.9, -179.9]], ring] as L.LatLngExpression[][],
      { stroke: false, fillColor: '#02060C', fillOpacity: 0.62, interactive: false }
    ).addTo(map);
    L.polygon(ring, { stroke: false, fillColor: '#2FA37A', fillOpacity: 0.06, interactive: false }).addTo(map);
    L.polygon(ring, { color: '#2FA37A', weight: 6, opacity: 0.16, lineJoin: 'round', fill: false, interactive: false }).addTo(map);
    L.polygon(ring, { color: '#E3B23C', weight: 1.4, opacity: 0.68, dashArray: '5 6', lineCap: 'butt', fill: false, interactive: false }).addTo(map);

    const home = { bounds, options: { padding: [34, 34] as [number, number] } };
    homeRef.current = home;

    // PLM Map is the default primary view: the 'plm' landmark's own centre
    // and zoom, same framing flyToLandmark uses for a click on that marker.
    //
    // Its own panning enclosure is the real PLM campus footprint
    // (PLM_BOUNDARY, from OpenStreetMap), padded the same way and by the same
    // ratio INTRAMUROS_BOUNDARY already is below -- a hard drag/swipe limit,
    // not a zoom limit, exactly like the full map's. minZoom is raised to
    // CAMPUS_MIN_ZOOM so a visitor can't zoom out past the point where that
    // enclosure would show mostly empty shaded space -- as a bonus, that's
    // exactly the zoom the campus building markers need anyway (syncCampus
    // below), so they're always visible in this view. The boundary itself is
    // drawn with the identical shade-outside/tint-inside/dashed-gold-line
    // treatment as the Intramuros polygons just above, just around the
    // campus instead of the walls, so "you can't leave this area" reads the
    // same way in both views.
    const plmLandmark = (LANDMARKS as Landmark[]).find(lm => lm.id === 'plm');
    const plmOuterRing = PLM_BOUNDARY.geometry.coordinates[0] as [number, number][];
    const plmRing = plmOuterRing.map(([lng, lat]) => [lat, lng] as [number, number]);
    plmRingRef.current = plmRing;
    const plmBounds = L.latLngBounds(plmRing);
    const campusMask = L.layerGroup([
      L.polygon(
        [[[-89.9, -179.9], [-89.9, 179.9], [89.9, 179.9], [89.9, -179.9]], plmRing] as L.LatLngExpression[][],
        { stroke: false, fillColor: '#02060C', fillOpacity: 0.62, interactive: false }
      ),
      L.polygon(plmRing, { stroke: false, fillColor: '#2FA37A', fillOpacity: 0.06, interactive: false }),
      L.polygon(plmRing, { color: '#2FA37A', weight: 6, opacity: 0.16, lineJoin: 'round', fill: false, interactive: false }),
      L.polygon(plmRing, { color: '#E3B23C', weight: 1.4, opacity: 0.68, dashArray: '5 6', lineCap: 'butt', fill: false, interactive: false })
    ]);
    campusMaskRef.current = campusMask;

    if (plmLandmark) {
      campusHomeRef.current = { center: [plmLandmark.lat, plmLandmark.lng], zoom: 18 };
      campusMaxBoundsRef.current = plmBounds.pad(0.25);
      map.setMaxBounds(campusMaxBoundsRef.current);
      map.setMinZoom(CAMPUS_MIN_ZOOM);
      map.setView(campusHomeRef.current.center, campusHomeRef.current.zoom, { animate: false });
      campusMask.addTo(map);
    } else {
      map.fitBounds(home.bounds, home.options);
    }

    function refitHome() {
      map.invalidateSize({ animate: false });
      if (!stateRef.current.dirs.open && !stateRef.current.activeId) {
        if (expandedRef.current) {
          map.fitBounds(home.bounds, { ...home.options, animate: false });
        } else if (campusHomeRef.current) {
          map.setView(campusHomeRef.current.center, campusHomeRef.current.zoom, { animate: false });
        }
      }
    }
    if (document.readyState === 'complete') refitHome();
    else window.addEventListener('load', refitHome, { once: true });
    let fontsCancelled = false;
    document.fonts?.ready.then(() => { if (!fontsCancelled) map.invalidateSize({ animate: false }); });
    let roT: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver(() => {
      clearTimeout(roT);
      roT = setTimeout(() => map.invalidateSize({ animate: false }), 150);
    });
    ro.observe(container);

    const cluster = L.markerClusterGroup({
      maxClusterRadius: 42,
      disableClusteringAtZoom: 18,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      iconCreateFunction(c: L.MarkerCluster) {
        const n = c.getChildCount();
        return L.divIcon({
          className: 'cluster-icon',
          html: `<div class="cluster${n > 9 ? ' cluster--lg' : ''}">${n}</div>`,
          iconSize: n > 9 ? [40, 40] : [34, 34]
        });
      }
    }).addTo(map);
    clusterRef.current = cluster;

    // ── landmarks (never clustered; always on the map directly) ──
    function buildLandmarkMarker(lm: Landmark, small: boolean): L.Marker {
      const marker = L.marker([lm.lat, lm.lng], {
        icon: L.divIcon({
          className: 'landmark-icon',
          // A provisional position (a visitor's pin the organisers have not
          // confirmed) draws dashed, the same tell the address-estimated food
          // pins use, so the map is honest about it before the popup is.
          html: `<div class="landmark${small ? ' landmark--campus' : ''}${lm.provisional ? ' landmark--provisional' : ''}"><span>${lm.glyph ? PIN_SVG(lm.glyph) : esc(lm.short || '★')}</span></div>`,
          iconSize: small ? [30, 30] : [40, 40],
          iconAnchor: small ? [15, 15] : [20, 20],
          popupAnchor: [0, small ? -15 : -20]
        }),
        title: lm.name,
        alt: lm.name,
        zIndexOffset: small ? 900 : 1000,
        riseOnHover: true,
        keyboard: true
      });
      // autoPan: false -- see the map-level popupopen handler below, which
      // replaces it with a synchronous clamp of the popup's own position.
      marker.bindPopup(landmarkPopupHTML(lm), { maxWidth: 260, minWidth: 220, autoPan: false });
      marker.on('click', () => flyToLandmark(lm.id));
      landmarkMarkersRef.current.set(lm.id, marker);
      return marker;
    }

    const campusLayer = L.layerGroup();
    if (Array.isArray(LANDMARKS) && LANDMARKS.length) {
      for (const lm of LANDMARKS as Landmark[]) {
        if (lm.campus) campusLayer.addLayer(buildLandmarkMarker(lm, true));
        else buildLandmarkMarker(lm, false).addTo(map);
      }
      const syncCampus = () => {
        if (map.getZoom() >= CAMPUS_MIN_ZOOM) {
          if (!map.hasLayer(campusLayer)) campusLayer.addTo(map);
        } else if (map.hasLayer(campusLayer)) {
          map.removeLayer(campusLayer);
        }
      };
      map.on('zoomend', syncCampus);
      syncCampus();
    }

    // ── every spot marker, across every mode, built once ──
    function buildMarker(spot: AnySpot): L.Marker {
      const derived = DERIVED_INDEX.get(spot.id)!;
      const m = MODES[derived.mode];
      const cat = m.categories[spot.category];
      const tier = m.tiers[String(m.tierOf(spot))];
      const estimate = spot.verified === false;
      const marker = L.marker([spot.lat, spot.lng], {
        icon: L.divIcon({
          className: 'pin-icon',
          // PHASE B (plan B4): .pin__hit is an invisible, larger click/tap
          // target layered under the visible disc -- it extends past the 30x30
          // box via CSS inset, which still bubbles clicks up to this marker's
          // handler (Leaflet's overflow is visible by default), so iconSize/
          // iconAnchor/popupAnchor below are untouched and every pin's geo
          // position is exactly as before.
          html: `<div class="pin${estimate ? ' pin--estimate' : ''}" style="--c:${cat.color}"><span class="pin__hit" aria-hidden="true"></span><span class="pin__disc">${PIN_SVG(cat.icon)}</span></div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 33],
          popupAnchor: [0, -32]
        }),
        title: `${spot.name} — ${tier.symbol}${estimate ? ' (approx. location)' : ''}`,
        alt: spot.name,
        riseOnHover: true
      });
      // autoPan: false -- see the map-level popupopen handler below, which
      // replaces it with a synchronous clamp of the popup's own position.
      marker.bindPopup(popupHTML(spot, m, derived), { maxWidth: 280, minWidth: 280, autoPan: false });
      // PHASE B (plan B5): a hover-only preview, completely decoupled from the
      // fly-and-commit popup above -- opens on mouseover with no camera move
      // and no state change, so scanning several pins costs nothing. Leaflet
      // only fires the underlying mouseover on a real pointer, so this is a
      // no-op on touch by construction; hidden outright on touch via the
      // (hover: hover) guard on .pin-preview in styles.css as a second layer.
      marker.bindTooltip(previewHTML(spot, m, derived), {
        className: 'pin-preview', direction: 'top', offset: [0, -28], opacity: 1
      });
      // The cursor is still over the pin at the moment its click opens the
      // popup, so the hover tooltip would otherwise stay stacked on top of it.
      marker.on('popupopen', () => marker.closeTooltip());
      marker.on('click', () => select(spot.id, { from: 'map' }));
      marker.on('popupclose', () => {
        if (stateRef.current.activeId === spot.id) setActive(null);
      });
      return marker;
    }

    for (const { spot } of ALL_SPOTS) markersRef.current.set(spot.id, buildMarker(spot));

    // ── directions layer ──
    routeLayerRef.current = L.layerGroup().addTo(map);

    // ── global map events ──
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (stateRef.current.dirs.picking) {
        stopPicking();
        setStart({ lat: e.latlng.lat, lng: e.latlng.lng, name: 'the point you tapped', id: '__tap' });
        return;
      }
      if (!stateRef.current.dirs.open) setActive(null);
    });
    map.on('movestart', () => hideMapNoteNow());

    // Every popup this app opens -- a spot's, a landmark's, reached by a marker
    // click, a list click, or chat's focusById -- passes through here on open
    // (fitPopup handles the one exception, flyToLandmark's own re-open, by
    // calling it again explicitly -- see that function's own comment). Also
    // closes the mobile bottom sheet: it can cover up to 88% of the screen
    // (styles.css), so a marker tapped on the sliver of map still showing
    // would otherwise open a popup hidden behind it. Covers every path that
    // opens a popup, not just the from:'list' one `select` already handles by
    // closing it before the fly starts.
    map.on('popupopen', (e: L.PopupEvent) => {
      fitPopup(map, e.popup);
      if (isMobileRef.current()) onSetSheetRef.current(false);
    });

    // The intro note fades out on its own if the user has not touched the map.
    // Ported from app.js:1189.
    const noteTimer = setTimeout(hideMapNoteNow, 9000);

    // The popup's "Get directions" button is Leaflet-owned HTML (popupHtml.ts),
    // not React JSX, so it cannot take an onClick -- it needs the same
    // document-level delegation app.js:1084-1085 used.
    function onDocumentClick(e: MouseEvent) {
      const go = (e.target as HTMLElement).closest?.('[data-go]');
      if (go) openDirections(go.getAttribute('data-go')!);
    }
    document.addEventListener('click', onDocumentClick);

    return () => {
      fontsCancelled = true;
      document.removeEventListener('click', onDocumentClick);
      window.removeEventListener('load', refitHome);
      ro.disconnect();
      clearTimeout(roT);
      clearTimeout(noteTimer);
      if (watchIdRef.current !== null) navigator.geolocation?.clearWatch(watchIdRef.current);
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
      landmarkMarkersRef.current.clear();
      pendingLandmarkRef.current = null;
      clusterRef.current = null;
      routeLayerRef.current = null;
      startMarkerRef.current = null;
      destMarkerRef.current = null;
      meMarkerRef.current = null;
      homeRef.current = null;
      campusHomeRef.current = null;
      campusMaxBoundsRef.current = null;
      intramurosMaxBoundsRef.current = null;
      campusMaskRef.current = null;
      plmRingRef.current = null;
      expandedRef.current = false;
      activePinIdRef.current = null;
      pendingSelectRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── keep the cluster's visible layer set in sync with the filtered list ──
     Ported from app.js:497-517 (the map half of render()). Pin active-class
     reapplication deliberately does NOT happen here -- it happens only in
     setActive, exactly matching app.js's own scoping (see its comment at
     app.js:539-542, which is about list cards, not pins). */
  useEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster) return;
    cluster.clearLayers();
    cluster.addLayers(computeClusterLayers(params.visibleIds));

    // A chat-driven focus on a spot outside the previous mode/filters is
    // completed here, once that spot's marker has actually rejoined the
    // cluster -- calling select() any earlier would find a real marker object
    // (markersRef always holds one) but one not yet part of the visible map.
    if (pendingFocusRef.current && params.visibleIds.includes(pendingFocusRef.current)) {
      const id = pendingFocusRef.current;
      pendingFocusRef.current = null;
      select(id, { from: 'list' });
    }

    if (firstPaintRef.current) {
      firstPaintRef.current = false;
      requestAnimationFrame(() => {
        params.visibleIds.forEach((id, i) => {
          const el = pinEl(id);
          if (!el) return;
          el.style.animationDelay = `${Math.min(i * 11, 320)}ms`;
          el.classList.add('pin--enter');
          el.addEventListener('animationend', () => {
            el.classList.remove('pin--enter');
            el.style.animationDelay = '';
          }, { once: true });
        });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.visibleIds]);

  /* ── draw the route once a result arrives -- the imperative half of
     app.js:894-943 renderRoute; the text half (distance/time/steps/credit) is
     plain JSX in DirectionsPanel reading the same state.dirs.result. ── */
  useEffect(() => {
    const map = mapRef.current;
    const res = params.state.dirs.result;
    const from = params.state.dirs.start;
    const layer = routeLayerRef.current;
    if (!map || !res || !from || !layer) return;

    layer.clearLayers();
    L.polyline(res.line, { color: '#2FA37A', weight: 9, opacity: 0.22, lineCap: 'round', lineJoin: 'round' }).addTo(layer);
    L.polyline(res.line, {
      color: '#E3B23C', weight: 3.5, opacity: 0.95, lineCap: 'round', lineJoin: 'round',
      dashArray: res.fallback ? '6 7' : undefined
    }).addTo(layer);

    if (startMarkerRef.current) map.removeLayer(startMarkerRef.current);
    startMarkerRef.current = L.marker([from.lat, from.lng], {
      icon: L.divIcon({ className: 'start-icon', html: '<div class="start-pin"></div>', iconSize: [18, 18] }),
      interactive: false,
      zIndexOffset: 900
    }).addTo(map);

    const routeBounds = L.latLngBounds(res.line as L.LatLngExpression[]);
    showOffCampus(routeBounds);
    map.flyToBounds(routeBounds.pad(0.18), {
      paddingTopLeft: [isMobileRef.current() ? 20 : 40, 40],
      paddingBottomRight: [40, isMobileRef.current() ? 40 : 40],
      ...flyOptions(0.8)
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.state.dirs.result]);

  const setPinHover = useCallback((id: string, hover: boolean) => {
    pinEl(id)?.classList.toggle('is-hover', hover);
  }, []);

  const clearSelection = useCallback(() => {
    setActive(null);
    mapRef.current?.closePopup();
  }, [setActive]);

  /** PLM Map (collapsed, primary by default) <-> the full Intramuros Map
   *  (expanded). Swaps the panning enclosure itself -- setMaxBounds/setMinZoom
   *  is what actually stops a drag/swipe from leaving the intended area, not
   *  the camera move -- and which drawn boundary (campusMask vs. the
   *  always-present Intramuros polygons) is the one currently relevant, then,
   *  if `fly`, flies to the new view's home. Bounds are set before the fly so
   *  the fly's own target (already inside the new bounds by construction) is
   *  never fighting a stale, looser constraint. `fly` is false when a caller
   *  expands only to make room for its own camera move (showOffCampus). */
  const setView = useCallback((expanded: boolean, fly: boolean) => {
    const map = mapRef.current;
    if (!map || expanded === expandedRef.current) return;
    expandedRef.current = expanded;

    if (expanded) {
      if (intramurosMaxBoundsRef.current) map.setMaxBounds(intramurosMaxBoundsRef.current);
      map.setMinZoom(INTRAMUROS_MIN_ZOOM);
      if (campusMaskRef.current && map.hasLayer(campusMaskRef.current)) map.removeLayer(campusMaskRef.current);
      if (fly && homeRef.current) map.flyToBounds(homeRef.current.bounds, { ...homeRef.current.options, ...flyOptions(0.8) });
    } else {
      if (campusMaxBoundsRef.current) map.setMaxBounds(campusMaxBoundsRef.current);
      map.setMinZoom(CAMPUS_MIN_ZOOM);
      if (campusMaskRef.current && !map.hasLayer(campusMaskRef.current)) campusMaskRef.current.addTo(map);
      if (fly && campusHomeRef.current) map.flyTo(campusHomeRef.current.center, campusHomeRef.current.zoom, flyOptions(0.8));
    }

    // Re-apply the PLM-boundary pin filter immediately -- the effect that
    // normally keeps the cluster in sync only re-runs on a visibleIds change,
    // which a mode toggle isn't, so without this the pin set would only catch
    // up the next time filters or the tab changed.
    const cluster = clusterRef.current;
    if (cluster) {
      cluster.clearLayers();
      cluster.addLayers(computeClusterLayers(visibleIdsRef.current));
    }

    onViewChangeRef.current(expanded);
  }, []);

  const toggleIntramurosView = useCallback(() => setView(!expandedRef.current, true), [setView]);

  /** The PLM Map's campus enclosure (maxBounds + minZoom) silently keeps
   *  anything outside it off-screen: a chat focus on an off-campus restaurant
   *  opened its popup out of view, and a route from a station was clamped to
   *  the campus. Whatever has to be shown and does not fit switches to the
   *  Intramuros Map first -- exactly what tapping the toggle would do. */
  const showOffCampus = useCallback((target: L.LatLng | L.LatLngBounds) => {
    const campus = campusMaxBoundsRef.current;
    if (!expandedRef.current && campus && !campus.contains(target)) setView(true, false);
  }, [setView]);

  /* `select` is scoped to the currently open tab (`MODES[state.mode].items`) --
     fine for a click, since a list card can only ever show the active mode's own
     items, but chat can name a hotel while Eat is open. So this always switches
     to the spot's own mode and clears that mode's filters -- unconditionally,
     even when the mode already matches, because a category/tier/search filter
     alone can hide the target just as completely as the wrong tab can. Both
     dispatches land in the same batch and fold in order, so RESET_FILTERS
     clears whichever mode SET_MODE just switched to, not the one being left.

     A landmark id (the PLM campus or one of its buildings) takes the other path:
     landmarks belong to no tab and no filter can hide them, so there is nothing
     to switch or reset -- it is exactly a click on the landmark's own marker. */
  const focusById = useCallback((id: string): boolean => {
    const hit = findAnywhere(id);
    if (!hit) return flyToLandmark(id);
    // Tested against the ring, not showOffCampus's bounds: the PLM Map hides
    // every pin outside the ring (computeClusterLayers), even one the camera
    // could still reach.
    const ring = plmRingRef.current;
    if (!expandedRef.current && ring && !pointInRing(hit.spot.lat, hit.spot.lng, ring)) setView(true, false);
    // Already on its tab and already on the map: nothing will change the id
    // list (useMapVisibleIds returns the same array for the same contents),
    // so the cluster-sync effect below would never fire to finish a pending
    // focus -- select now instead.
    if (stateRef.current.mode === hit.modeKey && visibleIdsRef.current.includes(id)) {
      select(id, { from: 'list' });
      return true;
    }
    pendingFocusRef.current = id;
    if (stateRef.current.mode !== hit.modeKey) {
      dispatchRef.current({ type: 'SET_MODE', mode: hit.modeKey });
    }
    dispatchRef.current({ type: 'RESET_FILTERS' });
    return true;
  }, [flyToLandmark, select, setView]);

  return {
    selectTab,
    select,
    openDirections,
    closeDirections: closeDirectionsInternal,
    setStart,
    useMyLocationForDirections,
    togglePicking,
    toggleLiveTracking,
    locateMe,
    resetAll,
    setPinHover,
    clearSelection,
    focusById,
    toggleIntramurosView
  };
}
