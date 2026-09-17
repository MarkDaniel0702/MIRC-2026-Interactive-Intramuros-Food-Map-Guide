/**
 * Leaflet popup HTML builders. These stay string builders -- not JSX -- because
 * Leaflet owns this DOM, not React (see hooks/useLeafletMap.ts and plan A6: popup
 * content must not become a declarative <Popup>, since React-Leaflet's open-on-
 * mount timing is exactly the autoPan/flyTo bug app.js's select() works around).
 *
 * Ported verbatim from app.js:306-315 (landmarkPopupHTML) and app.js:390-462
 * (popupHTML). One addition since: the landmark popup carries the same "Get
 * directions" button as a spot's, so the PLM campus and each of its buildings
 * can be walked to (resolved by data/destinations.ts, not findAnywhere).
 */
import { SIGHTS_REVIEWED } from '../../data/tourist-spots.js';
import { STAY_REVIEWED } from '../../data/hotels.js';
import { DATA_REVIEWED } from '../../data/food-spots.js';
import { esc, walkMins } from './format';
import { CLOCK_SVG, MARKER_SVG, ROUTE_SVG } from './icons';
import { VENUE_ANCHOR } from '../data/modes';
import type { AnySpot, DerivedInfo, ModeConfig } from '../types';
import type { Landmark } from '../../data/types';

export function landmarkPopupHTML(lm: Landmark): string {
  return `
    <div class="pop pop--landmark">
      <span class="pop__cat"><i></i>${esc(lm.kind || 'Landmark')}</span>
      <h2 class="pop__name">${esc(lm.name)}</h2>
      <p class="pop__blurb">${esc(lm.blurb)}</p>
      <p class="pop__where">${MARKER_SVG}<span>${esc(lm.street || 'Intramuros')}<br>Intramuros, Manila</span></p>
      ${lm.url ? `<p class="pop__contact"><a href="${esc(lm.url)}" target="_blank" rel="noopener">Official site</a></p>` : ''}

      <button type="button" class="pop__go" data-go="${esc(lm.id)}">
        ${ROUTE_SVG} Get directions
      </button>
    </div>`;
}

/**
 * PHASE B (plan B5): a lightweight hover preview, bound as a Leaflet tooltip
 * (not a popup) -- name + a glance at the price/fee, with none of the full
 * popup's detail. Shown instantly on hover with no camera movement, so a user
 * can scan several pins before committing to a click. See useLeafletMap.ts for
 * where this binds; kept intentionally short, unlike popupHTML above.
 */
export function previewHTML(spot: AnySpot, m: ModeConfig, derived: DerivedInfo): string {
  const tier = m.tiers[String(m.tierOf(spot))];
  const isSight = derived.mode === 'sights';
  const glance = isSight ? esc(spot.feeShort ?? tier.symbol) : tier.symbol;
  return `<span class="pin-preview__name">${esc(spot.name)}</span><span class="pin-preview__price">${glance}</span>`;
}

export function popupHTML(spot: AnySpot, m: ModeConfig, derived: DerivedInfo): string {
  const cat = m.categories[spot.category];
  const tier = m.tiers[String(m.tierOf(spot))];
  const where = [spot.area, spot.street].filter(Boolean).join(' · ') || 'Intramuros, Manila';
  const isSight = derived.mode === 'sights';
  const isStay = derived.mode === 'stay';

  // Food shows a price band; a sight shows the actual fee, its opening hours and
  // how long to allow; a hotel shows its nightly range and room count.
  let readout: string;
  if (isSight) {
    readout = `<div class="pop__price">
         <span class="pop__pesos">${esc(spot.fee)}</span>
         <span class="pop__band">${esc(spot.duration)} &middot; ${esc(walkMins(derived.anchorM))} min walk</span>
         <span class="pop__tierlabel">${esc(tier.label)}</span>
       </div>
       <p class="pop__hours">${CLOCK_SVG}<span>${esc(spot.hours)}</span></p>`;
  } else if (isStay) {
    readout = `<div class="pop__price">
         <span class="pop__pesos">${esc(spot.priceRange)}</span>
         <span class="pop__band">${spot.rooms ? esc(spot.rooms) + ' rooms &middot; ' : ''}${esc(walkMins(derived.anchorM))} min walk</span>
         <span class="pop__tierlabel">${esc(tier.label)}</span>
       </div>`;
  } else {
    readout = `<div class="pop__price">
         <span class="pop__pesos">${tier.symbol}</span>
         <span class="pop__band">${esc(tier.range)}</span>
         <span class="pop__tierlabel">${esc(tier.label)}</span>
       </div>`;
  }

  let tags: string[];
  if (isSight) tags = (spot.passport ? ['Intramuros Passport'] : []).concat(spot.feeNote ? [spot.feeNote] : []);
  else if (isStay) tags = (spot.roomTypes || []).slice(0, 4);
  else tags = spot.cuisine || [];

  // Hotels are the one record type with a way to actually book.
  const contact = isStay
    ? `<p class="pop__contact">
         ${spot.website ? `<a href="${esc(spot.website)}" target="_blank" rel="noopener">Official site</a>` : ''}
         ${spot.phone ? `<a href="tel:${esc(spot.phone.replace(/\s/g, ''))}">${esc(spot.phone)}</a>` : ''}
       </p>`
    : '';

  let foot: string;
  if (isSight) foot = `Fee and hours from the Intramuros Administration and the site operator, checked ${esc(SIGHTS_REVIEWED)}. Walking time is from ${esc(VENUE_ANCHOR.name)}.`;
  else if (isStay) foot = `Indicative nightly range, reviewed ${esc(STAY_REVIEWED)} — not a live rate. Confirm with the property. Method in HOTELS.md.`;
  else foot = `Price is an indicative range per person, reviewed ${esc(DATA_REVIEWED)}. Confirm with the venue.`;
  if (spot.verified === false) foot += ' This venue has no OpenStreetMap record — its position is estimated from the street address and is not independently verified.';

  return `
    <div class="pop${isSight || isStay ? ' pop--sight' : ''}" style="--c:${cat.color}">
      <span class="pop__cat"><i></i>${esc(cat.label)}</span>
      <h2 class="pop__name">${esc(spot.name)}</h2>
      ${spot.verified === false ? `<p class="pop__estimate">${MARKER_SVG}<span>Approximate location — placed from the street address${spot.street ? ` (${esc(spot.street)})` : ''}, not a mapped point.</span></p>` : ''}

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
