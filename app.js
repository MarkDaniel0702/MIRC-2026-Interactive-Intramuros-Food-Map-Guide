/**
 * Intramuros Guide — application logic.
 *
 * Depends on these globals, loaded before this file:
 *   INTRAMUROS_BOUNDARY                                   (data/intramuros-boundary.js)
 *   FOOD_SPOTS, PRICE_TIERS, CATEGORIES, DATA_REVIEWED    (data/food-spots.js)
 *   TOURIST_SPOTS, FEE_TIERS, SIGHT_CATEGORIES,
 *     VENUE_ANCHOR, WALK_METRES_PER_MIN,
 *     INTRAMUROS_PASSPORT, SIGHTS_REVIEWED                (data/tourist-spots.js)
 *   HOTELS, STAY_TIERS, STAY_CATEGORIES, STAY_REVIEWED    (data/hotels.js)
 *   START_POINTS                                          (data/start-points.js)
 *   Routing                                               (routing.js)
 *   L                                     (Leaflet + Leaflet.markercluster from CDN)
 *
 * Three datasets — food, sights and places to stay — are described by the MODES
 * table and switched with the Eat/See/Stay tabs. The map and the list are two views
 * of whichever one is active. Everything flows through render(): change state, call
 * render(), and both views agree. Adding a fourth dataset means adding a fourth
 * MODES entry, not a fourth code path.
 *
 * Directions are a second view of the same panel: openDirections() swaps the browse
 * chrome for an itinerary via a single class on the panel, and closeDirections()
 * puts it back.
 */
(function () {
  'use strict';

  /* ───────────────────────────── helpers ─────────────────────────────────── */

  const $ = sel => document.querySelector(sel);

  const esc = s => String(s ?? '').replace(/[&<>"']/g, m =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  /** Lowercase, strip accents, straighten quotes — so "Belfry Café" matches "cafe". */
  const norm = s => String(s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, '-');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = () => window.matchMedia('(max-width: 760px)').matches;

  /** Great-circle distance in metres. */
  function haversine(aLat, aLng, bLat, bLng) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (bLat - aLat) * rad, dLng = (bLng - aLng) * rad;
    const s = Math.sin(dLat / 2) ** 2 +
              Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  const fmtDistance = m => (m < 950 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);

  const walkMins = metres => Math.max(1, Math.round(metres / WALK_METRES_PER_MIN));

  /* Marker glyphs, one per category icon key. */
  const GLYPHS = {
    fork:    'M5.4 2.4v3.6a1.5 1.5 0 0 0 3 0V2.4M6.9 7.4v6.2M11.4 2.4c1.1 1.5 1.1 3.7 0 4.9v6.3',
    cup:     'M3.6 5.8h7.6v3.2a3.4 3.4 0 0 1-3.4 3.4h-.8a3.4 3.4 0 0 1-3.4-3.4zM11.2 6.8h1a1.5 1.5 0 0 1 0 3h-1',
    burger:  'M3.2 6.6c0-1.9 2.1-3.4 4.8-3.4s4.8 1.5 4.8 3.4zM3.2 8.8h9.6M3.7 10.9h8.6a2 2 0 0 1-2 2H5.7a2 2 0 0 1-2-2z',
    bowl:    'M2.6 7.6h10.8a5.4 5.4 0 0 1-10.8 0zM6.1 5.4c.5-.9 1.2-1.5 1.9-1.9.7.4 1.4 1 1.9 1.9',
    cone:    'M5.1 6.8h5.8L8 13.4zM5.3 6.8a2.7 2.7 0 0 1 5.4 0',
    /* sights */
    museum:  'M2.4 13.4h11.2M3.7 13.4V7M6.5 13.4V7M9.5 13.4V7M12.3 13.4V7M2.4 6.4 8 3l5.6 3.4z',
    church:  'M8 1.8v2.9M6.8 3.2h2.4M8 4.7 4.2 7.9v5.5h7.6V7.9zM6.9 13.4v-2.2a1.1 1.1 0 0 1 2.2 0v2.2',
    gate:    'M2.6 13.4V6.4L8 3.1l5.4 3.3v7M5.9 13.4V9.6a2.1 2.1 0 0 1 4.2 0v3.8M2.6 6.6h10.8',
    tree:    'M8 13.5v-3.1M4.7 9.6h6.6L8 3.3zM5.8 7h4.4M5.6 13.5h4.8',
    obelisk: 'M4.9 13.5h6.2M6.7 13.5 7.1 5.7h1.8l.4 7.8M7.1 5.7 8 2.5l.9 3.2',
    /* stay */
    bed:     'M2.2 12.8V4.4M2.2 8.2h11.6a2 2 0 0 1 2 2v2.6M2.2 11h13.6M5.4 6.9a1.3 1.3 0 1 0 0-.1z'
  };

  const PIN_SVG = key => `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${GLYPHS[key]}"/></svg>`;
  const MARKER_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14.5S13 10 13 6.4a5 5 0 0 0-10 0C3 10 8 14.5 8 14.5z"/><circle cx="8" cy="6.3" r="1.7"/></svg>';
  const CLOCK_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M8 4.6V8l2.4 1.6"/></svg>';
  const ROUTE_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M14.2 1.8 2 6.9l5.3 1.8L9.1 14z"/></svg>';

  /* Turn arrows for the itinerary. */
  const ARROWS = {
    left:     'M13 13.2V8.4a3 3 0 0 0-3-3H3.4M6.2 2.4 3 5.4l3.2 3',
    right:    'M3 13.2V8.4a3 3 0 0 1 3-3h6.6M9.8 2.4 13 5.4l-3.2 3',
    straight: 'M8 13.4V3.2M4.5 6.7 8 3.2l3.5 3.5',
    start:    'M8 13.6a5.6 5.6 0 1 1 0-11.2 5.6 5.6 0 0 1 0 11.2zM8 9.7a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4z',
    flag:     'M4 14.2V2.2M4 3.1h8.6l-1.9 2.9 1.9 2.9H4'
  };
  const ARROW_SVG = k => `<svg class="dirs__arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="${ARROWS[k] || ARROWS.straight}"/></svg>`;

  /* ─────────────────────────── the two datasets ──────────────────────────── */

  /**
   * Everything that differs between the "Eat" and "See" tabs lives here, so the
   * render path below stays single. Add a third dataset by adding a third entry.
   */
  const MODES = {
    food: {
      label: 'Eat',
      items: FOOD_SPOTS,
      categories: CATEGORIES,
      tiers: PRICE_TIERS,
      tierOf: s => s.priceTier,
      subtitle: 'Where to eat within the walls',
      placeholder: 'Search a name, dish or street…',
      filterLegend: 'Price range',
      filterNote: 'per person',
      legendTitle: 'Price key',
      legendNote: '— indicative, per person',
      noun: 'food spots',
      emptyText: 'No place to eat inside the walls matches these filters.',
      reviewed: DATA_REVIEWED
    },
    sights: {
      label: 'See',
      items: TOURIST_SPOTS,
      categories: SIGHT_CATEGORIES,
      tiers: FEE_TIERS,
      tierOf: s => s.feeTier,
      subtitle: 'What to see within the walls',
      placeholder: 'Search a name, period or street…',
      filterLegend: 'Entrance fee',
      filterNote: 'per person',
      legendTitle: 'Entrance fee key',
      legendNote: '— checked with the Intramuros Administration',
      noun: 'sights',
      emptyText: 'No sight inside the walls matches these filters.',
      reviewed: SIGHTS_REVIEWED
    },
    stay: {
      label: 'Stay',
      /* Only the three properties actually bookable by a traveller. The members-only
         AMOSUP facilities and the student dormitories stay in HOTELS.md but off the
         map — routing a delegate to a seafarers' dorm is a dead end. */
      items: HOTELS.filter(h => h.mapped),
      categories: STAY_CATEGORIES,
      tiers: STAY_TIERS,
      tierOf: h => h.priceTier,
      hideCategoryFilter: true,      // one category, three items — a filter would be noise
      subtitle: 'Where to stay within the walls',
      placeholder: 'Search a name or street…',
      filterLegend: 'Nightly rate',
      filterNote: 'per room',
      legendTitle: 'Nightly rate key',
      legendNote: '— indicative, see HOTELS.md',
      noun: 'places to stay',
      emptyText: 'No place to stay inside the walls matches these filters.',
      reviewed: STAY_REVIEWED
    }
  };

  /* ───────────────────────────── state ───────────────────────────────────── */

  const state = {
    mode: 'food',
    /* Filters are kept per mode, so switching tabs and back does not lose them. */
    byMode: {
      food:   { query: '', cats: new Set(), tiers: new Set() },
      sights: { query: '', cats: new Set(), tiers: new Set() },
      stay:   { query: '', cats: new Set(), tiers: new Set() }
    },
    activeId: null,
    userPos: null,
    meMarker: null,
    visible: [],
    /* Directions take over the panel; this is everything that view needs. */
    dirs: { open: false, destId: null, start: null, picking: false, busy: false }
  };

  const mode = () => MODES[state.mode];
  const filters = () => state.byMode[state.mode];

  /** Find a record by id across every dataset, not just the active one. */
  function findAnywhere(id) {
    for (const [key, m] of Object.entries(MODES)) {
      const hit = m.items.find(s => s.id === id);
      if (hit) return { spot: hit, modeKey: key };
    }
    return null;
  }

  const markers = new Map();  // spot id -> L.Marker
  const cards = new Map();    // spot id -> button element

  let firstPaint = !reduceMotion;

  // Precompute the search haystack, and the walk from the venue anchor, once.
  for (const [key, m] of Object.entries(MODES)) {
    for (const s of m.items) {
      s._mode = key;
      s._hay = norm([
        s.name, (s.cuisine || []).join(' '), s.street, s.area,
        m.categories[s.category].label, s.blurb, s.fee, s.duration,
        s.priceRange, (s.roomTypes || []).join(' ')
      ].filter(Boolean).join(' '));
      s._anchorM = haversine(VENUE_ANCHOR.lat, VENUE_ANCHOR.lng, s.lat, s.lng);
    }
  }

  /* ───────────────────────────── map ─────────────────────────────────────── */

  const ring = INTRAMUROS_BOUNDARY.geometry.coordinates[0].map(([lng, lat]) => [lat, lng]);
  const bounds = L.latLngBounds(ring);

  const map = L.map('map', {
    zoomControl: false,
    minZoom: 14,
    maxZoom: 19,
    zoomSnap: 0.5,
    maxBounds: bounds.pad(0.6),
    maxBoundsViscosity: 0.9,
    attributionControl: true
  });

  /* Standard OSM raster tiles: no API key, no sign-up, good detail down to z19.
     They arrive as a light, colourful plate — styles.css inverts and tints
     .leaflet-tile-pane into the navy night map the rest of the page is built on.
     If this ever serves real traffic, swap in a keyed provider (see README). */
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  L.control.zoom({ position: 'topleft' }).addTo(map);

  /* Everything outside the official boundary is pushed down toward black: a
     world-sized polygon with the Intramuros ring punched out as a hole. On a dark
     basemap a light scrim does nothing, so this has to be both darker and stronger
     than it would be over a light one. */
  L.polygon(
    [[[-89.9, -179.9], [-89.9, 179.9], [89.9, 179.9], [89.9, -179.9]], ring],
    { stroke: false, fillColor: '#02060C', fillOpacity: 0.62, interactive: false }
  ).addTo(map);

  /* ...and the inside is lifted with a faint wash of the system green, so the
     district reads as the live region rather than merely the less-dark one. */
  L.polygon(ring, {
    stroke: false, fillColor: '#2FA37A', fillOpacity: 0.06, interactive: false
  }).addTo(map);

  /* The boundary itself: a soft green glow carrying a fine gold survey dash.
     Gold is the accent that marks the key edge — kept at partial opacity so it
     reads as a drawn line, not a neon one. */
  L.polygon(ring, {
    color: '#2FA37A', weight: 6, opacity: 0.16,
    lineJoin: 'round', fill: false, interactive: false
  }).addTo(map);

  L.polygon(ring, {
    color: '#E3B23C', weight: 1.4, opacity: 0.68,
    dashArray: '5 6', lineCap: 'butt', fill: false, interactive: false
  }).addTo(map);

  const HOME = { bounds, options: { padding: [34, 34] } };
  map.fitBounds(HOME.bounds, HOME.options);

  const cluster = L.markerClusterGroup({
    maxClusterRadius: 42,
    disableClusteringAtZoom: 18,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    iconCreateFunction(c) {
      const n = c.getChildCount();
      return L.divIcon({
        className: 'cluster-icon',
        html: `<div class="cluster${n > 9 ? ' cluster--lg' : ''}">${n}</div>`,
        iconSize: n > 9 ? [40, 40] : [34, 34]
      });
    }
  }).addTo(map);

  /* ───────────────────────────── markers ─────────────────────────────────── */

  function buildMarker(spot, m) {
    const cat = m.categories[spot.category];
    const tier = m.tiers[m.tierOf(spot)];
    const marker = L.marker([spot.lat, spot.lng], {
      icon: L.divIcon({
        className: 'pin-icon',
        html: `<div class="pin" style="--c:${cat.color}"><span class="pin__disc">${PIN_SVG(cat.icon)}</span></div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 33],
        popupAnchor: [0, -32]
      }),
      title: `${spot.name} — ${tier.symbol}`,
      alt: spot.name,
      riseOnHover: true
    });

    marker.bindPopup(popupHTML(spot, m), { maxWidth: 280, minWidth: 280, autoPanPadding: [26, 26] });
    marker.on('click', () => select(spot.id, { from: 'map' }));
    marker.on('popupclose', () => {
      if (state.activeId === spot.id) setActive(null);
    });
    return marker;
  }

  function popupHTML(spot, m) {
    const cat = m.categories[spot.category];
    const tier = m.tiers[m.tierOf(spot)];
    const where = [spot.area, spot.street].filter(Boolean).join(' · ') || 'Intramuros, Manila';
    const isSight = spot._mode === 'sights';
    const isStay = spot._mode === 'stay';

    /* Food shows a price band; a sight shows the actual fee, its opening hours and
       how long to allow — the three things that decide whether it fits in a gap
       between conference sessions; a hotel shows its nightly range and room count. */
    let readout;
    if (isSight) {
      readout = `<div class="pop__price">
           <span class="pop__pesos">${esc(spot.fee)}</span>
           <span class="pop__band">${esc(spot.duration)} &middot; ${esc(walkMins(spot._anchorM))} min walk</span>
           <span class="pop__tierlabel">${esc(tier.label)}</span>
         </div>
         <p class="pop__hours">${CLOCK_SVG}<span>${esc(spot.hours)}</span></p>`;
    } else if (isStay) {
      readout = `<div class="pop__price">
           <span class="pop__pesos">${esc(spot.priceRange)}</span>
           <span class="pop__band">${spot.rooms ? esc(spot.rooms) + ' rooms &middot; ' : ''}${esc(walkMins(spot._anchorM))} min walk</span>
           <span class="pop__tierlabel">${esc(tier.label)}</span>
         </div>`;
    } else {
      readout = `<div class="pop__price">
           <span class="pop__pesos">${tier.symbol}</span>
           <span class="pop__band">${esc(tier.range)}</span>
           <span class="pop__tierlabel">${esc(tier.label)}</span>
         </div>`;
    }

    let tags;
    if (isSight) tags = (spot.passport ? ['Intramuros Passport'] : []).concat(spot.feeNote ? [spot.feeNote] : []);
    else if (isStay) tags = (spot.roomTypes || []).slice(0, 4);
    else tags = (spot.cuisine || []);

    /* Hotels are the one record type with a way to actually book. */
    const contact = isStay
      ? `<p class="pop__contact">
           ${spot.website ? `<a href="${esc(spot.website)}" target="_blank" rel="noopener">Official site</a>` : ''}
           ${spot.phone ? `<a href="tel:${esc(spot.phone.replace(/\s/g, ''))}">${esc(spot.phone)}</a>` : ''}
         </p>`
      : '';

    let foot;
    if (isSight) foot = `Fee and hours from the Intramuros Administration and the site operator, checked ${esc(SIGHTS_REVIEWED)}. Walking time is from ${esc(VENUE_ANCHOR.name)}.`;
    else if (isStay) foot = `Indicative nightly range, reviewed ${esc(STAY_REVIEWED)} — not a live rate. Confirm with the property. Method in HOTELS.md.`;
    else foot = `Price is an indicative range per person, reviewed ${esc(DATA_REVIEWED)}. Confirm with the venue.`;

    return `
      <div class="pop${isSight || isStay ? ' pop--sight' : ''}" style="--c:${cat.color}">
        <span class="pop__cat"><i></i>${esc(cat.label)}</span>
        <h2 class="pop__name">${esc(spot.name)}</h2>

        ${readout}

        <p class="pop__blurb">${esc(spot.blurb)}</p>

        ${tags.length ? `<div class="pop__tags">${tags.map(t => `<span class="pop__tag">${esc(t)}</span>`).join('')}</div>` : ''}

        <p class="pop__where">${MARKER_SVG}<span>${esc(where)}<br>Intramuros, Manila</span></p>
        ${contact}

        <button type="button" class="pop__go" data-go="${esc(spot.id)}">
          ${ROUTE_SVG} Get directions
        </button>

        <p class="pop__foot">${foot}</p>
      </div>`;
  }

  for (const m of Object.values(MODES)) {
    for (const spot of m.items) markers.set(spot.id, buildMarker(spot, m));
  }

  /* ───────────────────────────── filtering ───────────────────────────────── */

  function matches(spot, m, f) {
    if (f.cats.size && !f.cats.has(spot.category)) return false;
    if (f.tiers.size && !f.tiers.has(m.tierOf(spot))) return false;
    if (f.query) {
      for (const term of f.query.split(/\s+/)) {
        if (term && !spot._hay.includes(term)) return false;
      }
    }
    return true;
  }

  function render() {
    const m = mode();
    const f = filters();
    const visible = m.items.filter(s => matches(s, m, f));

    if (state.userPos) {
      for (const s of visible) {
        s._dist = haversine(state.userPos.lat, state.userPos.lng, s.lat, s.lng);
      }
      visible.sort((a, b) => a._dist - b._dist);
    } else {
      visible.sort((a, b) => a.name.localeCompare(b.name, 'en'));
    }

    state.visible = visible;

    // ── map ──
    cluster.clearLayers();
    cluster.addLayers(visible.map(s => markers.get(s.id)));

    // On the very first paint, stagger the pins in. Clustered pins have no element
    // yet, so this quietly skips them — which is the intent.
    if (firstPaint) {
      firstPaint = false;
      requestAnimationFrame(() => {
        visible.forEach((s, i) => {
          const el = pinEl(s.id);
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

    // ── list ──
    const list = $('#list');
    cards.clear();
    list.innerHTML = visible.map((s, i) => cardHTML(s, i, m)).join('');
    for (const btn of list.querySelectorAll('.card')) cards.set(btn.dataset.id, btn);

    // ── counters & empty state ──
    const total = m.items.length;
    const filtered = f.query || f.cats.size || f.tiers.size;
    $('#count').innerHTML = filtered
      ? `Showing <b>${visible.length}</b> of ${total} ${esc(m.noun)}`
      : `<b>${total}</b> ${esc(m.noun)} inside the walls`;
    $('#gripText').textContent = filtered
      ? `${visible.length} of ${total} ${m.noun}`
      : `${total} ${m.noun}`;

    $('#empty').hidden = visible.length !== 0;
    $('#emptyText').textContent = m.emptyText;
    list.hidden = visible.length === 0;

    // Reapply the active highlight, which the innerHTML rewrite just cleared.
    if (state.activeId && cards.has(state.activeId)) {
      cards.get(state.activeId).classList.add('is-active');
    }
  }

  function cardHTML(spot, index, m) {
    const cat = m.categories[spot.category];
    const tier = m.tiers[m.tierOf(spot)];
    const where = spot.street || spot.area || 'Intramuros';
    const delay = reduceMotion ? 0 : Math.min(index * 14, 340);
    const isSight = spot._mode === 'sights';
    const isStay = spot._mode === 'stay';

    let badge, badgeTitle, meta;
    if (isSight) {
      badge = spot.feeShort;
      badgeTitle = `${tier.label}${spot.feeNote ? ' — ' + spot.feeNote : ''}`;
      meta = `<b>${esc(cat.label)}</b> &middot; ${esc(spot.duration)} &middot; ${walkMins(spot._anchorM)} min walk`;
    } else if (isStay) {
      badge = tier.symbol;
      badgeTitle = `${tier.label} — ${tier.range} per night`;
      meta = `<b>${spot.rooms ? esc(spot.rooms) + ' rooms' : 'Rooms not published'}</b> &middot; ${esc(spot.priceRange)}`;
    } else {
      badge = tier.symbol;
      badgeTitle = `${tier.label} — ${tier.range} per person`;
      meta = `<b>${esc(cat.label)}</b> &middot; ${esc((spot.cuisine || []).join(', '))}`;
    }

    return `
      <li class="card-item" style="animation-delay:${delay}ms">
        <button type="button" class="card${isSight ? ' card--sight' : ''}" data-id="${esc(spot.id)}" style="--c:${cat.color}">
          <span class="card__top">
            <span class="card__name">${esc(spot.name)}</span>
            <span class="card__price" title="${esc(badgeTitle)}">${esc(badge)}</span>
          </span>
          <span class="card__meta">${meta}</span>
          <span class="card__where">
            ${MARKER_SVG}${esc(where)}
            ${spot._dist != null && state.userPos ? `<span class="card__dist">${fmtDistance(spot._dist)}</span>` : ''}
          </span>
        </button>
      </li>`;
  }

  /* ───────────────────────────── selection ───────────────────────────────── */

  function pinEl(id) {
    const el = markers.get(id)?.getElement();
    return el ? el.querySelector('.pin') : null;
  }

  function setActive(id) {
    if (state.activeId) {
      cards.get(state.activeId)?.classList.remove('is-active');
      pinEl(state.activeId)?.classList.remove('is-active');
    }
    state.activeId = id;
    if (id) {
      cards.get(id)?.classList.add('is-active');
      pinEl(id)?.classList.add('is-active');
    }
  }

  /**
   * Select a spot from either view and bring the other view into agreement.
   * from 'list' — fly the map to it and open the popup.
   * from 'map'  — scroll its card into view.
   */
  function select(id, { from }) {
    const spot = mode().items.find(s => s.id === id);
    const marker = markers.get(id);
    if (!spot || !marker) return;

    setActive(id);
    hideMapNote();

    if (from === 'list') {
      if (isMobile()) setSheet(false);           // don't cover the map we just flew to
      cluster.zoomToShowLayer(marker, () => {
        marker.openPopup();
        setActive(id);                           // the pin element exists only now
      });
    } else {
      const card = cards.get(id);
      if (card) {
        card.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    }
  }

  /* ───────────────────────────── controls ────────────────────────────────── */

  /** Rebuilds chips and legend for the active mode, restoring its saved filters. */
  function buildChips() {
    const m = mode();
    const f = filters();

    $('#categoryFilter').hidden = !!m.hideCategoryFilter;
    $('#categoryChips').innerHTML = Object.entries(m.categories).map(([key, cat]) => `
      <button type="button" class="chip" role="switch" aria-pressed="${f.cats.has(key)}"
              data-group="cat" data-value="${esc(key)}" style="--c:${cat.color}">
        <span class="chip__dot"></span>${esc(cat.label)}
      </button>`).join('');

    $('#priceChips').innerHTML = Object.entries(m.tiers).map(([tier, meta]) => `
      <button type="button" class="chip" role="switch" aria-pressed="${f.tiers.has(Number(tier))}"
              data-group="tier" data-value="${tier}"
              aria-label="${esc(meta.label)}, ${esc(meta.range)}">
        <span class="chip__peso">${meta.symbol}</span>
        <span class="chip__band">${esc(meta.short)}</span>
      </button>`).join('');

    $('#tierLegend').innerHTML =
      `${esc(m.filterLegend)} <span class="filter__note">${esc(m.filterNote)}</span>`;
  }

  function buildLegend() {
    const m = mode();
    $('#legend').innerHTML = Object.values(m.tiers).map(t =>
      `<dt>${t.symbol}</dt><dd>${esc(t.label)} <span>&mdash; ${esc(t.range)}</span></dd>`).join('');
    $('#legendTitle').innerHTML =
      `${esc(m.legendTitle)} <span>${esc(m.legendNote)}</span>`;

    // The dialog always documents the food price scale.
    $('#dialogLegend').innerHTML = Object.values(PRICE_TIERS).map(t =>
      `<dt>${t.symbol}</dt><dd>${esc(t.label)} <span>&mdash; ${esc(t.range)}</span></dd>`).join('');

    // The combined-ticket note only makes sense on the sights tab.
    $('#passport').hidden = state.mode !== 'sights';
    $('#passportPrice').textContent = INTRAMUROS_PASSPORT.price;
    $('#passportText').textContent =
      `Covers ${INTRAMUROS_PASSPORT.covers.join(', ')}. ${INTRAMUROS_PASSPORT.extra} ` +
      `Worth it from three paid sites onward.`;
  }

  /** Switch between the Eat and See datasets. */
  function setMode(next) {
    if (next === state.mode) return;
    state.mode = next;

    for (const tab of document.querySelectorAll('.tab')) {
      const on = tab.dataset.mode === next;
      tab.classList.toggle('is-on', on);
      tab.setAttribute('aria-selected', String(on));
    }

    const m = mode();
    $('#mastheadSub').textContent = m.subtitle;
    $('#search').placeholder = m.placeholder;
    $('#search').value = filters().query;
    $('#searchClear').hidden = !filters().query;
    $('#reviewedDate').textContent = m.reviewed;

    setActive(null);
    map.closePopup();
    buildChips();
    buildLegend();
    render();
  }

  function toast(message) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.textContent = message;
    $('.mapwrap').appendChild(el);
    setTimeout(() => { el.classList.add('is-out'); }, 3600);
    setTimeout(() => el.remove(), 4100);
  }

  function hideMapNote() { $('#mapNote').classList.add('is-hidden'); }

  function resetAll() {
    const f = filters();
    f.query = '';
    f.cats.clear();
    f.tiers.clear();
    $('#search').value = '';
    $('#searchClear').hidden = true;
    for (const chip of document.querySelectorAll('.chip')) chip.setAttribute('aria-pressed', 'false');
    setActive(null);
    map.closePopup();
    render();
    map.flyToBounds(HOME.bounds, { ...HOME.options, duration: reduceMotion ? 0 : 0.8 });
    $('#mapNote').classList.remove('is-hidden');
  }

  /* ═══════════════════════════ directions ═════════════════════════════════ */

  const routeLayer = L.layerGroup().addTo(map);
  let startMarker = null;
  let destMarker = null;

  /** Dedicated destination pin. The ordinary marker may be inside a cluster and have
      no element to restyle, so directions get their own, always-visible marker. */
  function showDestination(spot) {
    if (destMarker) map.removeLayer(destMarker);
    const cat = MODES[spot._mode].categories[spot.category];
    destMarker = L.marker([spot.lat, spot.lng], {
      icon: L.divIcon({
        className: 'dest-icon',
        html: `<div class="dest-pin" style="--c:${cat.color}">
                 <span class="dest-pin__disc">${PIN_SVG(cat.icon)}</span>
               </div>`,
        iconSize: [38, 38], iconAnchor: [19, 42]
      }),
      interactive: false,
      zIndexOffset: 1200,
      title: spot.name
    }).addTo(map);
  }

  function hideDestination() {
    if (destMarker) { map.removeLayer(destMarker); destMarker = null; }
  }

  const fmtMins = secs => {
    const m = Math.max(1, Math.round(secs / 60));
    return m < 60 ? `${m} min walk` : `${Math.floor(m / 60)} h ${m % 60} min walk`;
  };

  function buildPresets() {
    $('#dirsPresets').innerHTML = START_POINTS.map(p => `
      <button type="button" class="chip chip--preset" data-start="${esc(p.id)}"
              title="${esc(p.note)}">
        ${esc(p.name)}${p.outside ? '<span class="chip__out">outside</span>' : ''}
      </button>`).join('');
  }

  /** Open the directions view for a destination in any tab. */
  function openDirections(id) {
    const found = findAnywhere(id);
    if (!found) return;

    // Make sure the destination's own tab is active, so its marker is on the map
    // and going "back" lands somewhere consistent.
    if (found.modeKey !== state.mode) setMode(found.modeKey);

    state.dirs.open = true;
    state.dirs.destId = id;
    state.dirs.picking = false;

    panel.classList.add('is-directions');
    $('#dirs').hidden = false;
    $('#dirsTo').textContent = found.spot.name;
    $('#dirsResult').hidden = true;
    setDirsMessage(null);

    setActive(id);
    showDestination(found.spot);
    map.closePopup();
    if (isMobile()) setSheet(true);

    // A start we already know about (from "Near me") gets used straight away.
    if (state.dirs.start) runRoute();
    else map.flyTo([found.spot.lat, found.spot.lng], 17, { duration: reduceMotion ? 0 : 0.7 });
  }

  function closeDirections() {
    state.dirs.open = false;
    state.dirs.destId = null;
    state.dirs.picking = false;
    stopPicking();

    routeLayer.clearLayers();
    if (startMarker) { map.removeLayer(startMarker); startMarker = null; }
    hideDestination();

    panel.classList.remove('is-directions');
    $('#dirs').hidden = true;
    setActive(null);
    map.flyToBounds(HOME.bounds, { ...HOME.options, duration: reduceMotion ? 0 : 0.7 });
  }

  function setDirsMessage(text, kind) {
    const el = $('#dirsMsg');
    el.hidden = !text;
    el.textContent = text || '';
    el.className = 'dirs__msg' + (kind ? ` dirs__msg--${kind}` : '');
  }

  function setStart(point) {
    state.dirs.start = point;
    for (const c of document.querySelectorAll('.chip--preset')) {
      c.classList.toggle('is-on', c.dataset.start === point.id);
    }
    runRoute();
  }

  async function runRoute() {
    const dest = findAnywhere(state.dirs.destId);
    const from = state.dirs.start;
    if (!dest || !from || state.dirs.busy) return;

    state.dirs.busy = true;
    setDirsMessage('Finding a walking route…', 'busy');

    const res = await Routing.route(
      from, { lat: dest.spot.lat, lng: dest.spot.lng }, dest.spot.name
    );

    state.dirs.busy = false;
    renderRoute(res, from, dest.spot);
  }

  function renderRoute(res, from, dest) {
    setDirsMessage(
      res.fallback
        ? (res.reason === 'timeout'
            ? 'The routing service did not answer in time — showing a direct line and an estimate instead.'
            : 'The routing service is unavailable — showing a direct line and an estimate instead.')
        : null,
      res.fallback ? 'warn' : null
    );

    $('#dirsResult').hidden = false;
    $('#dirsDist').textContent = fmtDistance(res.distance);
    $('#dirsTime').textContent = fmtMins(res.duration);
    $('#dirsFromName').textContent = `From ${from.name}`;

    $('#dirsSteps').innerHTML = res.steps.map((s, i) => `
      <li class="dirs__step${s.last ? ' dirs__step--last' : ''}">
        <span class="dirs__n">${i + 1}</span>
        ${ARROW_SVG(s.arrow)}
        <span class="dirs__text">
          ${esc(s.text)}
          ${s.distance > 5 && !s.last ? `<span class="dirs__len">${fmtDistance(s.distance)}</span>` : ''}
        </span>
      </li>`).join('');

    $('#dirsCredit').innerHTML = res.fallback
      ? `Straight-line estimate at 80 m/min.` +
        (res.externalUrl ? ` <a href="${esc(res.externalUrl)}" target="_blank" rel="noopener">Open in OpenStreetMap</a>` : '')
      : 'Walking route by the FOSSGIS OSRM service, using OpenStreetMap data.';

    // ── draw it ──
    routeLayer.clearLayers();
    L.polyline(res.line, { color: '#2FA37A', weight: 9, opacity: 0.22, lineCap: 'round', lineJoin: 'round' }).addTo(routeLayer);
    L.polyline(res.line, {
      color: '#E3B23C', weight: 3.5, opacity: 0.95, lineCap: 'round', lineJoin: 'round',
      dashArray: res.fallback ? '6 7' : null
    }).addTo(routeLayer);

    if (startMarker) map.removeLayer(startMarker);
    startMarker = L.marker([from.lat, from.lng], {
      icon: L.divIcon({ className: 'start-icon', html: '<div class="start-pin"></div>', iconSize: [18, 18] }),
      interactive: false, zIndexOffset: 900
    }).addTo(map);

    map.flyToBounds(L.latLngBounds(res.line).pad(0.18), {
      paddingTopLeft: [isMobile() ? 20 : 40, 40],
      paddingBottomRight: [40, isMobile() ? 40 : 40],
      duration: reduceMotion ? 0 : 0.8
    });
  }

  /* ── choosing a start point ── */

  function useMyLocation() {
    if (!navigator.geolocation) {
      setDirsMessage('This browser cannot share your location. Pick a starting point below instead.', 'warn');
      return;
    }
    setDirsMessage('Getting your location…', 'busy');
    navigator.geolocation.getCurrentPosition(
      pos => {
        state.userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        for (const c of document.querySelectorAll('.chip--preset')) c.classList.remove('is-on');
        setStart({ lat: pos.coords.latitude, lng: pos.coords.longitude, name: 'your location', id: '__me' });
      },
      err => {
        setDirsMessage(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was denied. Tap a point on the map, or pick a starting point below.'
            : 'Could not get your location. Tap a point on the map, or pick a starting point below.',
          'warn');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  function startPicking() {
    state.dirs.picking = true;
    $('#dirsPickOnMap').classList.add('is-on');
    document.body.classList.add('is-picking');
    setDirsMessage('Tap anywhere on the map to set your starting point.', 'busy');
    if (isMobile()) setSheet(false);   // the map has to be reachable
  }

  function stopPicking() {
    state.dirs.picking = false;
    $('#dirsPickOnMap')?.classList.remove('is-on');
    document.body.classList.remove('is-picking');
  }

  /* ── wiring ── */

  buildPresets();

  $('#dirsBack').addEventListener('click', closeDirections);
  $('#dirsUseLocation').addEventListener('click', useMyLocation);
  $('#dirsPickOnMap').addEventListener('click', () => {
    state.dirs.picking ? (stopPicking(), setDirsMessage(null)) : startPicking();
  });

  $('#dirsPresets').addEventListener('click', e => {
    const chip = e.target.closest('.chip--preset');
    if (!chip) return;
    const p = START_POINTS.find(x => x.id === chip.dataset.start);
    if (p) setStart({ lat: p.lat, lng: p.lng, name: p.name, id: p.id });
  });

  /* ───────────────────────── mobile bottom sheet ─────────────────────────── */

  const panel = $('#panel');
  const grip = $('#sheetGrip');

  const maxHidden = () => Math.max(panel.offsetHeight - grip.offsetHeight, 0);

  function setSheet(open) {
    panel.classList.toggle('is-open', open);
    grip.setAttribute('aria-expanded', String(open));
  }

  (function wireSheet() {
    let dragging = false, startY = 0, startT = 0, moved = 0;

    grip.addEventListener('pointerdown', e => {
      if (!isMobile()) return;
      dragging = true; moved = 0; startY = e.clientY;
      startT = panel.classList.contains('is-open') ? 0 : maxHidden();
      panel.classList.add('is-dragging');
      grip.setPointerCapture(e.pointerId);
    });

    grip.addEventListener('pointermove', e => {
      if (!dragging) return;
      const dy = e.clientY - startY;
      moved = Math.max(moved, Math.abs(dy));
      panel.style.transform = `translateY(${Math.min(Math.max(startT + dy, 0), maxHidden())}px)`;
    });

    const end = e => {
      if (!dragging) return;
      dragging = false;
      panel.classList.remove('is-dragging');
      panel.style.transform = '';
      if (moved < 6) setSheet(!panel.classList.contains('is-open'));
      else setSheet(startT + (e.clientY - startY) < maxHidden() / 2);
    };
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
  })();

  /* ───────────────────────────── events ──────────────────────────────────── */

  let searchTimer;
  $('#search').addEventListener('input', e => {
    const raw = e.target.value;
    $('#searchClear').hidden = raw.length === 0;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { filters().query = norm(raw).trim(); render(); }, 130);
  });

  $('#searchClear').addEventListener('click', () => {
    $('#search').value = '';
    $('#searchClear').hidden = true;
    filters().query = '';
    render();
    $('#search').focus();
  });

  document.addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if (tab) {
      if (state.dirs.open) closeDirections();
      setMode(tab.dataset.mode);
      return;
    }

    /* Only filter chips carry data-group. The start-point presets are also .chip,
       and without this they would fall into the filter sets as NaN and silently
       filter the list down to nothing. */
    const chip = e.target.closest('.chip[data-group]');
    if (chip) {
      const on = chip.getAttribute('aria-pressed') !== 'true';
      chip.setAttribute('aria-pressed', String(on));
      const f = filters();
      const set = chip.dataset.group === 'cat' ? f.cats : f.tiers;
      const value = chip.dataset.group === 'cat' ? chip.dataset.value : Number(chip.dataset.value);
      on ? set.add(value) : set.delete(value);
      render();
      return;
    }

    const go = e.target.closest('[data-go]');
    if (go) { openDirections(go.dataset.go); return; }

    const card = e.target.closest('.card');
    if (card) select(card.dataset.id, { from: 'list' });
  });

  // Hovering a card lifts the matching pin.
  $('#list').addEventListener('pointerover', e => {
    const card = e.target.closest('.card');
    if (card) pinEl(card.dataset.id)?.classList.add('is-hover');
  });
  $('#list').addEventListener('pointerout', e => {
    const card = e.target.closest('.card');
    if (card) pinEl(card.dataset.id)?.classList.remove('is-hover');
  });

  $('#reset').addEventListener('click', resetAll);
  $('#emptyReset').addEventListener('click', resetAll);

  $('#aboutBtn').addEventListener('click', () => $('#aboutDialog').showModal());

  $('#nearMe').addEventListener('click', function () {
    if (!navigator.geolocation) {
      toast('This browser cannot share your location.');
      return;
    }
    this.classList.add('is-busy');
    navigator.geolocation.getCurrentPosition(
      pos => {
        this.classList.remove('is-busy');
        const { latitude: lat, longitude: lng } = pos.coords;
        state.userPos = { lat, lng };

        if (state.meMarker) map.removeLayer(state.meMarker);
        state.meMarker = L.marker([lat, lng], {
          icon: L.divIcon({ className: 'me-icon', html: '<div class="me"></div>', iconSize: [16, 16] }),
          interactive: false,
          zIndexOffset: 1000
        }).addTo(map);

        render();
        const nearest = state.visible[0];
        toast(nearest
          ? `Sorted by distance. Nearest: ${nearest.name}, ${fmtDistance(nearest._dist)} away.`
          : 'Location found, but no spots match your filters.');

        if (bounds.contains([lat, lng])) {
          map.flyTo([lat, lng], 17, { duration: reduceMotion ? 0 : 0.9 });
        } else {
          toast('You are outside Intramuros — the list is sorted by distance from you.');
        }
      },
      err => {
        this.classList.remove('is-busy');
        toast(err.code === err.PERMISSION_DENIED
          ? 'Location permission denied.'
          : 'Could not get your location. (Geolocation needs https or localhost.)');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#aboutDialog').open) {
      if (state.dirs.picking) { stopPicking(); setDirsMessage(null); return; }
      if (state.dirs.open) { closeDirections(); return; }
      if (state.activeId) { setActive(null); map.closePopup(); }
    }
    // "/" focuses the search box, as long as the user isn't already typing.
    if (e.key === '/' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
      e.preventDefault();
      $('#search').focus();
    }
  });

  map.on('click', e => {
    if (state.dirs.picking) {
      stopPicking();
      setStart({ lat: e.latlng.lat, lng: e.latlng.lng, name: 'the point you tapped', id: '__tap' });
      return;
    }
    if (!state.dirs.open) setActive(null);
  });
  map.on('movestart', hideMapNote);


  /* ───────────────────────────── boot ────────────────────────────────────── */

  buildChips();
  buildLegend();
  $('#mastheadSub').textContent = mode().subtitle;
  $('#search').placeholder = mode().placeholder;
  $('#reviewedDate').textContent = mode().reviewed;
  $('#dlgCount').textContent = FOOD_SPOTS.length + TOURIST_SPOTS.length;
  $('#dlgFoodCount').textContent = FOOD_SPOTS.length;
  $('#dlgSightCount').textContent = TOURIST_SPOTS.length;
  $('#dlgAnchor').textContent = VENUE_ANCHOR.name;
  for (const el of document.querySelectorAll('.reviewed-date')) el.textContent = DATA_REVIEWED;
  render();

  // The intro note fades out on its own if the user has not touched the map.
  setTimeout(hideMapNote, 9000);
})();
