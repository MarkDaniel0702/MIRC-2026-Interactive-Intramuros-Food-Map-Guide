import { Fragment } from 'react';
import type { RefObject } from 'react';
import { FOOD_SPOTS, PRICE_TIERS, DATA_REVIEWED } from '../../data/food-spots.js';
import { TOURIST_SPOTS, SIGHTS_REVIEWED, VENUE_ANCHOR } from '../../data/tourist-spots.js';
import { HOTELS } from '../../data/hotels.js';
import { LANDMARKS } from '../../data/landmarks.js';

/** Ported from index.html:188-260. Counts match app.js:1178-1184 exactly -- note
 *  dlgCount uses every hotel record, not just the mapped ones (app.js:1179's
 *  comment: "the verify gate checks food + sights + every hotel record + landmarks"). */
export function AboutDialog({ dialogRef }: { dialogRef: RefObject<HTMLDialogElement> }) {
  const landmarkCount = Array.isArray(LANDMARKS) ? LANDMARKS.length : 0;
  const dlgCount = FOOD_SPOTS.length + TOURIST_SPOTS.length + HOTELS.length + landmarkCount;
  const dlgStayCount = HOTELS.filter(h => h.mapped).length;

  return (
    <dialog className="dialog" ref={dialogRef} aria-labelledby="aboutTitle">
      <form method="dialog" className="dialog__close-form">
        <button className="dialog__close" aria-label="Close">&times;</button>
      </form>

      <h2 className="dialog__title" id="aboutTitle">About this map</h2>

      <h3>What counts as Intramuros</h3>
      <p>
        Every spot on this map sits inside the <strong>official administrative boundary of
        Intramuros</strong> — OpenStreetMap relation <code>103707</code>, the same polygon
        drawn on the map as the lit ground.
      </p>
      <p>
        This is checked, not claimed. The list was built by querying only within that polygon,
        and a script re-tests all {dlgCount} coordinates against it:
        {' '}<code>node tools/verify-in-intramuros.mjs</code>. Nothing from Binondo, Ermita, Malate
        or Quiapo appears here, because nothing outside the boundary can pass that check.
      </p>

      <h3>What is on the map</h3>
      <p>
        Three sets, switched with the <strong>Eat</strong> / <strong>See</strong> /
        {' '}<strong>Stay</strong> tabs: <b>{FOOD_SPOTS.length}</b> places to eat with price ranges,
        {' '}<b>{TOURIST_SPOTS.length}</b> heritage sights with entrance fees and realistic visit
        times, and <b>{dlgStayCount}</b> places to stay inside the walls. Filters, search
        and the list all follow whichever tab is active. The <b>Pamantasan ng Lungsod ng
        Maynila</b> campus (the MIRC 2026 venue) is highlighted on every tab; tap it to zoom
        in, and its buildings and halls appear once the map is zoomed close.
      </p>

      <h3>How price ranges work</h3>
      <p>
        Food prices are shown as a tier plus an explicit peso band, using one scale across
        every listing:
      </p>
      <dl className="legend legend--dialog">
        {Object.values(PRICE_TIERS).map(t => (
          <Fragment key={t.symbol}>
            <dt>{t.symbol}</dt>
            <dd>{t.label} <span>&mdash; {t.range}</span></dd>
          </Fragment>
        ))}
      </dl>
      <p className="dialog__caveat">
        These are <strong>indicative estimates for a typical meal per person</strong>, not quoted
        prices. They come from published prices where those exist, standard chain pricing, and
        establishment type otherwise. Menus change — treat the band as a guide and confirm with
        the venue.
      </p>

      <h3>Entrance fees and visit times</h3>
      <p>
        Sight entrance fees come from the <strong>Intramuros Administration</strong>
        {' '}(<code>intramuros.gov.ph</code>) and the operators' own pages, checked
        {' '}<span>{SIGHTS_REVIEWED}</span>. Unlike restaurant prices these are published and
        reasonably stable, but confirm before you travel. Discounted rates generally apply to
        students, seniors and PWD — bring ID.
      </p>
      <p>
        Visit durations are estimates for an unhurried look, not a rush. Walking times are
        straight-line distances from <b>{VENUE_ANCHOR.name}</b> at 80 m per minute, so allow a
        little more on the ground.
      </p>

      <h3>Sources</h3>
      <p>
        Names and coordinates come from OpenStreetMap via the Overpass API, retrieved
        {' '}<span>{DATA_REVIEWED}</span>, and were re-checked against Nominatim — every one
        came back in the Intramuros quarter. Map data and base tiles
        &copy; OpenStreetMap contributors (ODbL). Full method in <code>DATA.md</code>.
      </p>
      <p>
        A few small eateries are not yet in OpenStreetMap. They show with a <strong>dashed
        pin and an &ldquo;approximate location&rdquo; note</strong>: the position is estimated
        from the street address and still checked to fall inside the boundary, but is not
        independently confirmed.
      </p>

      <h3>Privacy</h3>
      <p>
        Your location is only used if you tap <strong>My location</strong> or <strong>Near
        me</strong>. It stays in your browser to sort the list by distance, and is sent
        as coordinates to the FOSSGIS OSRM routing service only when you ask for
        directions — it is never stored on any server here. Questions you send to Dan are
        passed through a Cloudflare Worker to Groq or Google's Gemini to generate an
        answer, and may be logged server-side to improve future answers; they are not tied
        to your name or any account, because this site has none. This site sets no
        cookies and runs no analytics or ad tracking.
      </p>

      <h3>Credits</h3>
      <p>
        Created by <strong>Mark Daniel Apelledo</strong> — creator of the Intramuros Map and
        Dan, its AI guide.
      </p>
      <p>
        Built under the guidance of advisers <strong>Dr. Dan Michael A. Cortez</strong>,
        {' '}<strong>Ms. Editha S. Medina</strong> and <strong>Mr. Neil Marcus T. Manubay</strong>.
      </p>
      <p>
        Dan's voice was added by <strong>Christian Andrei V. Santiago</strong>, credited
        specifically for building the text-to-speech capability.
        {' '}<strong>Alvin V. Genota</strong> is a consultant to the creators — he was
        Mr. Santiago's professor last year and is currently Mr. Apelledo's Intelligent
        Systems professor.
      </p>
    </dialog>
  );
}
