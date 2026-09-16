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
import { LANDMARKS } from '../../data/landmarks.js';
import type { Landmark } from '../../data/types';

import { ALL_SPOTS, DERIVED_INDEX, MODES, findAnywhere } from '../data/modes';
import { esc } from '../lib/format';
import { PIN_SVG } from '../lib/icons';
import { landmarkPopupHTML, popupHTML, previewHTML } from '../lib/popupHtml';
import { matches } from '../lib/filter';
import { haversine, fmtDistance } from '../lib/format';
import { route as routeRequest } from '../lib/routing';
import { reduceMotionOnce } from '../lib/motion';
import type { Action, FullAppState } from '../state/store';
import type { AnySpot, LatLng, ModeKey } from '../types';

const CAMPUS_MIN_ZOOM = 17;

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

export interface MapApi {
  selectTab: (mode: ModeKey) => void;
  select: (id: string, opts: { from: 'list' | 'map' }) => void;
  openDirections: (id: string) => void;
  closeDirections: () => void;
  setStart: (point: LatLng & { id: string; name: string }) => void;
  useMyLocationForDirections: () => void;
  togglePicking: () => void;
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
   *  currently open. Returns false immediately if the id names no real spot,
   *  which the caller (ChatPanel) uses to say so rather than silently do nothing. */
  focusById: (id: string) => boolean;
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
}

export function useLeafletMap(params: UseLeafletMapParams): MapApi {
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const startMarkerRef = useRef<L.Marker | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const meMarkerRef = useRef<L.Marker | null>(null);
  const homeRef = useRef<{ bounds: L.LatLngBounds; options: L.FitBoundsOptions } | null>(null);
  const firstPaintRef = useRef(!reduceMotionOnce);
  const pendingSelectRef = useRef<string | null>(null);
  const activePinIdRef = useRef<string | null>(null);
  /** Set by focusById when the target spot's mode/filters had to change first --
   *  a marker only joins the cluster (and so becomes flyTo/popup-able) once the
   *  visibleIds-sync effect below has run against the new state. Resolved there,
   *  the same deferred-until-ready shape pendingSelectRef already uses for the
   *  moveend race, just gated on cluster membership instead of camera movement. */
  const pendingFocusRef = useRef<string | null>(null);

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

  /** Ported from app.js:591-601 setActive -- the single place a pin's .is-active
   *  DOM class changes, paired with the React-state dispatch every call site needs. */
  const setActive = useCallback((id: string | null, from: 'list' | 'map' | null = null) => {
    const prev = activePinIdRef.current;
    if (prev) pinEl(prev)?.classList.remove('is-active');
    activePinIdRef.current = id;
    if (id) pinEl(id)?.classList.add('is-active');
    dispatchRef.current({ type: 'SET_ACTIVE', id, from });
  }, []);

  function showDestinationNow(spot: AnySpot) {
    const map = mapRef.current;
    if (!map) return;
    if (destMarkerRef.current) map.removeLayer(destMarkerRef.current);
    const modeKey = DERIVED_INDEX.get(spot.id)!.mode;
    const cat = MODES[modeKey].categories[spot.category];
    destMarkerRef.current = L.marker([spot.lat, spot.lng], {
      icon: L.divIcon({
        className: 'dest-icon',
        html: `<div class="dest-pin" style="--c:${cat.color}"><span class="dest-pin__disc">${PIN_SVG(cat.icon)}</span></div>`,
        iconSize: [38, 38],
        iconAnchor: [19, 42]
      }),
      interactive: false,
      zIndexOffset: 1200,
      title: spot.name
    }).addTo(map);
  }

  function hideDestinationNow() {
    const map = mapRef.current;
    if (destMarkerRef.current && map) {
      map.removeLayer(destMarkerRef.current);
      destMarkerRef.current = null;
    }
  }

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
    const dest = findAnywhere(destId);
    if (!dest) return;

    dispatchRef.current({ type: 'DIRS_SET_BUSY', busy: true });
    dispatchRef.current({ type: 'DIRS_SET_MESSAGE', message: { text: 'Finding a walking route…', kind: 'busy' } });

    const res = await routeRequest(from, { lat: dest.spot.lat, lng: dest.spot.lng }, dest.spot.name);

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

  /** Ported from app.js:819-845 openDirections. */
  const openDirections = useCallback((id: string) => {
    const map = mapRef.current;
    if (!map) return;
    const found = findAnywhere(id);
    if (!found) return;

    dispatchRef.current({ type: 'DIRS_OPEN', destId: id, mode: found.modeKey });
    setActive(id);
    showDestinationNow(found.spot);
    map.closePopup();
    if (isMobileRef.current()) onSetSheetRef.current(true);

    const currentStart = stateRef.current.dirs.start;
    if (currentStart) {
      runRoute({ destId: id, start: currentStart });
    } else {
      map.flyTo([found.spot.lat, found.spot.lng], 17, flyOptions(0.7));
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

  /** Ported from app.js:847-861 closeDirections. */
  const closeDirectionsInternal = useCallback(() => {
    const map = mapRef.current;
    if (!map || !homeRef.current) return;
    dispatchRef.current({ type: 'DIRS_CLOSE' });
    stopPicking();
    routeLayerRef.current?.clearLayers();
    if (startMarkerRef.current) { map.removeLayer(startMarkerRef.current); startMarkerRef.current = null; }
    hideDestinationNow();
    setActive(null);
    map.flyToBounds(homeRef.current.bounds, { ...homeRef.current.options, ...flyOptions(0.7) });
  }, [setActive, stopPicking]);

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
    if (!map || !homeRef.current) return;
    setActive(null);
    map.closePopup();
    dispatchRef.current({ type: 'RESET_FILTERS' });
    map.flyToBounds(homeRef.current.bounds, { ...homeRef.current.options, ...flyOptions(0.8) });
    showMapNoteNow();
  }, [setActive, showMapNoteNow]);

  /* ────────────────────────── mount: build the map once ────────────────────── */

  useEffect(() => {
    const container = params.containerRef.current;
    if (!container) return;

    // The boundary is a Polygon: coordinates[0] is its outer ring.
    const outerRing = INTRAMUROS_BOUNDARY.geometry.coordinates[0] as [number, number][];
    const ring = outerRing.map(([lng, lat]) => [lat, lng] as [number, number]);
    const bounds = L.latLngBounds(ring);

    const map = L.map(container, {
      zoomControl: false,
      minZoom: 14,
      maxZoom: 19,
      zoomSnap: 0.5,
      maxBounds: bounds.pad(0.6),
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
    map.fitBounds(home.bounds, home.options);

    function refitHome() {
      map.invalidateSize({ animate: false });
      if (!stateRef.current.dirs.open && !stateRef.current.activeId) {
        map.fitBounds(home.bounds, { ...home.options, animate: false });
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
    let pendingLandmark: string | null = null;
    function buildLandmarkMarker(lm: Landmark, small: boolean): L.Marker {
      const marker = L.marker([lm.lat, lm.lng], {
        icon: L.divIcon({
          className: 'landmark-icon',
          html: `<div class="landmark${small ? ' landmark--campus' : ''}"><span>${esc(lm.short || '★')}</span></div>`,
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
      marker.bindPopup(landmarkPopupHTML(lm), { maxWidth: 260, minWidth: 220, autoPanPadding: [26, 26] });
      // PHASE B FIX (plan B2): app.js:333-336 opened this popup synchronously
      // right after calling flyTo, the original version of the exact bug
      // select()'s moveend sequencing (below) exists to prevent -- it just never
      // showed up here because landmark popups are short. Sequenced the same way
      // now, including the pending-id guard for a rapid click on a second landmark.
      marker.on('click', () => {
        map.flyTo([lm.lat, lm.lng], 18, flyOptions(0.8));
        pendingLandmark = lm.id;
        let revealT: ReturnType<typeof setTimeout>;
        const reveal = () => {
          map.off('moveend', reveal);
          clearTimeout(revealT);
          if (pendingLandmark !== lm.id) return;
          pendingLandmark = null;
          marker.openPopup();
        };
        map.on('moveend', reveal);
        revealT = setTimeout(reveal, reduceMotionOnce ? 60 : 1200);
      });
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
      marker.bindPopup(popupHTML(spot, m, derived), { maxWidth: 280, minWidth: 280, autoPanPadding: [26, 26] });
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
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
      clusterRef.current = null;
      routeLayerRef.current = null;
      startMarkerRef.current = null;
      destMarkerRef.current = null;
      meMarkerRef.current = null;
      homeRef.current = null;
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
    const layers = params.visibleIds
      .map(id => markersRef.current.get(id))
      .filter((l): l is L.Marker => Boolean(l));
    cluster.addLayers(layers);

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

    map.flyToBounds(L.latLngBounds(res.line as L.LatLngExpression[]).pad(0.18), {
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

  /* `select` is scoped to the currently open tab (`MODES[state.mode].items`) --
     fine for a click, since a list card can only ever show the active mode's own
     items, but chat can name a hotel while Eat is open. So this always switches
     to the spot's own mode and clears that mode's filters -- unconditionally,
     even when the mode already matches, because a category/tier/search filter
     alone can hide the target just as completely as the wrong tab can. Both
     dispatches land in the same batch and fold in order, so RESET_FILTERS
     clears whichever mode SET_MODE just switched to, not the one being left. */
  const focusById = useCallback((id: string): boolean => {
    const hit = findAnywhere(id);
    if (!hit) return false;
    pendingFocusRef.current = id;
    if (stateRef.current.mode !== hit.modeKey) {
      dispatchRef.current({ type: 'SET_MODE', mode: hit.modeKey });
    }
    dispatchRef.current({ type: 'RESET_FILTERS' });
    return true;
  }, []);

  return {
    selectTab,
    select,
    openDirections,
    closeDirections: closeDirectionsInternal,
    setStart,
    useMyLocationForDirections,
    togglePicking,
    locateMe,
    resetAll,
    setPinHover,
    clearSelection,
    focusById
  };
}
