/**
 * Intramuros Food Map — application logic.
 *
 * Depends on three globals loaded before this file:
 *   INTRAMUROS_BOUNDARY  (data/intramuros-boundary.js)
 *   FOOD_SPOTS, PRICE_TIERS, CATEGORIES, DATA_REVIEWED  (data/food-spots.js)
 *   L  (Leaflet + Leaflet.markercluster from CDN)
 *
 * The map and the list are two views of one filtered set. Everything flows through
 * render(): change state, call render(), both views agree.
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

  const pesos = tier => PRICE_TIERS[tier].symbol;

  /* Marker glyphs, one per category icon key. */
  const GLYPHS = {
    fork:   'M5.4 2.4v3.6a1.5 1.5 0 0 0 3 0V2.4M6.9 7.4v6.2M11.4 2.4c1.1 1.5 1.1 3.7 0 4.9v6.3',
    cup:    'M3.6 5.8h7.6v3.2a3.4 3.4 0 0 1-3.4 3.4h-.8a3.4 3.4 0 0 1-3.4-3.4zM11.2 6.8h1a1.5 1.5 0 0 1 0 3h-1',
    glass:  'M3.2 3.6h9.6L8 9.2zM8 9.2v3.9M5.6 13.1h4.8',
    burger: 'M3.2 6.6c0-1.9 2.1-3.4 4.8-3.4s4.8 1.5 4.8 3.4zM3.2 8.8h9.6M3.7 10.9h8.6a2 2 0 0 1-2 2H5.7a2 2 0 0 1-2-2z',
    bowl:   'M2.6 7.6h10.8a5.4 5.4 0 0 1-10.8 0zM6.1 5.4c.5-.9 1.2-1.5 1.9-1.9.7.4 1.4 1 1.9 1.9',
    cone:   'M5.1 6.8h5.8L8 13.4zM5.3 6.8a2.7 2.7 0 0 1 5.4 0'
  };

  const PIN_SVG = key => `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${GLYPHS[key]}"/></svg>`;
  const MARKER_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14.5S13 10 13 6.4a5 5 0 0 0-10 0C3 10 8 14.5 8 14.5z"/><circle cx="8" cy="6.3" r="1.7"/></svg>';

  /* ───────────────────────────── state ───────────────────────────────────── */

  const state = {
    query: '',
    cats: new Set(),
    tiers: new Set(),
    activeId: null,
    userPos: null,
    meMarker: null,
    visible: []
  };

  const markers = new Map();  // spot id -> L.Marker
  const cards = new Map();    // spot id -> button element

  let firstPaint = !reduceMotion;

  // Precompute the search haystack once.
  for (const s of FOOD_SPOTS) {
    s._hay = norm([
      s.name, s.cuisine.join(' '), s.street, s.area,
      CATEGORIES[s.category].label, s.blurb
    ].filter(Boolean).join(' '));
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
     They arrive quite colourful — styles.css warms and desaturates .leaflet-tile-pane
     so the map sits on the same parchment as the rest of the page.
     If this ever serves real traffic, swap in a keyed provider (see README). */
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  L.control.zoom({ position: 'topleft' }).addTo(map);

  /* Everything outside the official boundary is dimmed: a world-sized polygon
     with the Intramuros ring punched out as a hole. */
  L.polygon(
    [[[-89.9, -179.9], [-89.9, 179.9], [89.9, 179.9], [89.9, -179.9]], ring],
    { stroke: false, fillColor: '#241C14', fillOpacity: 0.16, interactive: false }
  ).addTo(map);

  /* The boundary itself, drawn as a surveyor's dashed line. */
  L.polygon(ring, {
    color: '#A6432C', weight: 1.6, opacity: 0.7,
    dashArray: '3 5', lineCap: 'round', fill: false, interactive: false
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

  function buildMarker(spot) {
    const cat = CATEGORIES[spot.category];
    const marker = L.marker([spot.lat, spot.lng], {
      icon: L.divIcon({
        className: 'pin-icon',
        html: `<div class="pin" style="--c:${cat.color}"><span class="pin__disc">${PIN_SVG(cat.icon)}</span></div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 33],
        popupAnchor: [0, -32]
      }),
      title: `${spot.name} — ${pesos(spot.priceTier)}`,
      alt: spot.name,
      riseOnHover: true
    });

    marker.bindPopup(popupHTML(spot), { maxWidth: 262, minWidth: 262, autoPanPadding: [24, 24] });
    marker.on('click', () => select(spot.id, { from: 'map' }));
    marker.on('popupclose', () => {
      if (state.activeId === spot.id) setActive(null);
    });
    return marker;
  }

  function popupHTML(spot) {
    const cat = CATEGORIES[spot.category];
    const tier = PRICE_TIERS[spot.priceTier];
    const where = [spot.area, spot.street].filter(Boolean).join(' · ') || 'Intramuros, Manila';

    return `
      <div class="pop" style="--c:${cat.color}">
        <span class="pop__cat"><i></i>${esc(cat.label)}</span>
        <h2 class="pop__name">${esc(spot.name)}</h2>

        <div class="pop__price">
          <span class="pop__pesos">${tier.symbol}</span>
          <span class="pop__band">${esc(tier.range)}</span>
          <span class="pop__tierlabel">${esc(tier.label)}</span>
        </div>

        <p class="pop__blurb">${esc(spot.blurb)}</p>

        <div class="pop__tags">${spot.cuisine.map(c => `<span class="pop__tag">${esc(c)}</span>`).join('')}</div>

        <p class="pop__where">${MARKER_SVG}<span>${esc(where)}<br>Intramuros, Manila</span></p>

        <p class="pop__foot">Price is an indicative range per person, reviewed ${esc(DATA_REVIEWED)}. Confirm with the venue.</p>
      </div>`;
  }

  for (const spot of FOOD_SPOTS) markers.set(spot.id, buildMarker(spot));

  /* ───────────────────────────── filtering ───────────────────────────────── */

  function matches(spot) {
    if (state.cats.size && !state.cats.has(spot.category)) return false;
    if (state.tiers.size && !state.tiers.has(spot.priceTier)) return false;
    if (state.query) {
      for (const term of state.query.split(/\s+/)) {
        if (term && !spot._hay.includes(term)) return false;
      }
    }
    return true;
  }

  function render() {
    const visible = FOOD_SPOTS.filter(matches);

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
    list.innerHTML = visible.map((s, i) => cardHTML(s, i)).join('');
    for (const btn of list.querySelectorAll('.card')) cards.set(btn.dataset.id, btn);

    // ── counters & empty state ──
    const total = FOOD_SPOTS.length;
    const filtered = state.query || state.cats.size || state.tiers.size;
    $('#count').innerHTML = filtered
      ? `Showing <b>${visible.length}</b> of ${total} spots`
      : `<b>${total}</b> food spots inside the walls`;
    $('#gripText').textContent = filtered
      ? `${visible.length} of ${total} spots`
      : `${total} food spots`;

    $('#empty').hidden = visible.length !== 0;
    list.hidden = visible.length === 0;

    // Reapply the active highlight, which the innerHTML rewrite just cleared.
    if (state.activeId && cards.has(state.activeId)) {
      cards.get(state.activeId).classList.add('is-active');
    }
  }

  function cardHTML(spot, index) {
    const cat = CATEGORIES[spot.category];
    const where = spot.street || spot.area || 'Intramuros';
    const delay = reduceMotion ? 0 : Math.min(index * 14, 340);

    return `
      <li class="card-item" style="animation-delay:${delay}ms">
        <button type="button" class="card" data-id="${esc(spot.id)}" style="--c:${cat.color}">
          <span class="card__top">
            <span class="card__name">${esc(spot.name)}</span>
            <span class="card__price" title="${esc(PRICE_TIERS[spot.priceTier].label)} — ${esc(PRICE_TIERS[spot.priceTier].range)} per person">${PRICE_TIERS[spot.priceTier].symbol}</span>
          </span>
          <span class="card__meta"><b>${esc(cat.label)}</b> &middot; ${esc(spot.cuisine.join(', '))}</span>
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
    const spot = FOOD_SPOTS.find(s => s.id === id);
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

  function buildChips() {
    $('#categoryChips').innerHTML = Object.entries(CATEGORIES).map(([key, cat]) => `
      <button type="button" class="chip" role="switch" aria-pressed="false"
              data-group="cat" data-value="${esc(key)}" style="--c:${cat.color}">
        <span class="chip__dot"></span>${esc(cat.label)}
      </button>`).join('');

    $('#priceChips').innerHTML = Object.entries(PRICE_TIERS).map(([tier, meta]) => `
      <button type="button" class="chip" role="switch" aria-pressed="false"
              data-group="tier" data-value="${tier}"
              aria-label="${esc(meta.label)}, ${esc(meta.range)} per person">
        <span class="chip__peso">${meta.symbol}</span>
        <span class="chip__band">${esc(meta.short)}</span>
      </button>`).join('');
  }

  function buildLegend() {
    const html = Object.values(PRICE_TIERS).map(t =>
      `<dt>${t.symbol}</dt><dd>${esc(t.label)} <span>&mdash; ${esc(t.range)}</span></dd>`).join('');
    $('#legend').innerHTML = html;
    $('#dialogLegend').innerHTML = html;
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
    state.query = '';
    state.cats.clear();
    state.tiers.clear();
    $('#search').value = '';
    $('#searchClear').hidden = true;
    for (const chip of document.querySelectorAll('.chip')) chip.setAttribute('aria-pressed', 'false');
    setActive(null);
    map.closePopup();
    render();
    map.flyToBounds(HOME.bounds, { ...HOME.options, duration: reduceMotion ? 0 : 0.8 });
    $('#mapNote').classList.remove('is-hidden');
  }

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
    searchTimer = setTimeout(() => { state.query = norm(raw).trim(); render(); }, 130);
  });

  $('#searchClear').addEventListener('click', () => {
    $('#search').value = '';
    $('#searchClear').hidden = true;
    state.query = '';
    render();
    $('#search').focus();
  });

  document.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (chip) {
      const on = chip.getAttribute('aria-pressed') !== 'true';
      chip.setAttribute('aria-pressed', String(on));
      const set = chip.dataset.group === 'cat' ? state.cats : state.tiers;
      const value = chip.dataset.group === 'cat' ? chip.dataset.value : Number(chip.dataset.value);
      on ? set.add(value) : set.delete(value);
      render();
      return;
    }

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
    if (e.key === 'Escape' && state.activeId && !$('#aboutDialog').open) {
      setActive(null);
      map.closePopup();
    }
    // "/" focuses the search box, as long as the user isn't already typing.
    if (e.key === '/' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
      e.preventDefault();
      $('#search').focus();
    }
  });

  map.on('click', () => setActive(null));
  map.on('movestart', hideMapNote);

  /* ───────────────────────────── boot ────────────────────────────────────── */

  buildChips();
  buildLegend();
  $('#reviewedDate').textContent = DATA_REVIEWED;
  $('#dlgCount').textContent = FOOD_SPOTS.length;
  for (const el of document.querySelectorAll('.reviewed-date')) el.textContent = DATA_REVIEWED;
  render();

  // The intro note fades out on its own if the user has not touched the map.
  setTimeout(hideMapNote, 9000);
})();
