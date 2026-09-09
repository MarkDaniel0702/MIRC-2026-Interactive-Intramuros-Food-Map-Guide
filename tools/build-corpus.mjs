/**
 * Chatbot corpus builder.
 *
 *   node tools/build-corpus.mjs
 *
 * The chatbot answers only from a single file, data/chat-corpus.json. This script
 * builds that file by merging two sources:
 *
 *   1. data/mirc-2026.json  — the congress knowledge base, filled in by the committee.
 *   2. data/*.js            — the map's own food, sights, hotels and arrival points,
 *                             compacted and annotated with a walking time from the venue.
 *
 * Neither source is edited here; this only combines them. Nothing is invented: a
 * field left null in mirc-2026.json stays null, and the worker instructs the model
 * to treat null as "not published yet" rather than guessing.
 *
 * Re-run after any edit to data/mirc-2026.json or the map data, then redeploy the
 * site so the worker picks the new corpus up.
 *
 * Exit code 0 = written. Exit code 1 = a source file was missing or malformed.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = (...p) => join(root, 'data', ...p);

/* ── terminal colours (skipped when output is piped or NO_COLOR is set) ───────── */
const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const green = s => c('32', s);
const red = s => c('31', s);
const amber = s => c('33', s);
const dim = s => c('2', s);
const bold = s => c('1', s);

function die(msg, err) {
  console.error(`\n  ${red('FAILED')}  ${msg}`);
  if (err) console.error(dim(`          ${err.message}`));
  process.exit(1);
}

/* ── sources ─────────────────────────────────────────────────────────────────── */

let mirc;
try {
  mirc = JSON.parse(readFileSync(data('mirc-2026.json'), 'utf8'));
} catch (err) {
  die('could not read data/mirc-2026.json', err);
}

let FOOD_SPOTS, PRICE_TIERS, CATEGORIES, DATA_REVIEWED;
let TOURIST_SPOTS, FEE_TIERS, SIGHT_CATEGORIES, VENUE_ANCHOR, WALK_METRES_PER_MIN, INTRAMUROS_PASSPORT;
let HOTELS, START_POINTS;
try {
  ({ FOOD_SPOTS, PRICE_TIERS, CATEGORIES, DATA_REVIEWED } = require(data('food-spots.js')));
  ({ TOURIST_SPOTS, FEE_TIERS, SIGHT_CATEGORIES, VENUE_ANCHOR, WALK_METRES_PER_MIN, INTRAMUROS_PASSPORT } =
    require(data('tourist-spots.js')));
  ({ HOTELS } = require(data('hotels.js')));
  ({ START_POINTS } = require(data('start-points.js')));
} catch (err) {
  die('could not load the map data files', err);
}

/* ── helpers ─────────────────────────────────────────────────────────────────── */

/** Great-circle distance in metres — same formula the app uses. */
function haversine(aLat, aLng, bLat, bLng) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad, dLng = (bLng - aLng) * rad;
  const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** "4 min walk (300 m)" from the venue anchor — straight line, as the site says. */
function fromVenue(lat, lng) {
  const m = haversine(VENUE_ANCHOR.lat, VENUE_ANCHOR.lng, lat, lng);
  const mins = Math.max(1, Math.round(m / WALK_METRES_PER_MIN));
  const dist = m < 950 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
  return `${mins} min walk (${dist})`;
}

const drop = obj => Object.fromEntries(Object.entries(obj).filter(([, v]) =>
  v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)));

/* ── compact the map data ────────────────────────────────────────────────────── */

const food = FOOD_SPOTS.map(s => drop({
  name: s.name,
  category: CATEGORIES[s.category]?.label ?? s.category,
  price: `${PRICE_TIERS[s.priceTier].label} — ${PRICE_TIERS[s.priceTier].range} per person`,
  cuisine: Array.isArray(s.cuisine) ? s.cuisine.join(', ') : s.cuisine,
  where: [s.street, s.area].filter(Boolean).join(' · '),
  fromVenue: fromVenue(s.lat, s.lng),
  about: s.blurb
})).sort((a, b) => a.name.localeCompare(b.name));

const sights = TOURIST_SPOTS.map(s => drop({
  name: s.name,
  category: SIGHT_CATEGORIES?.[s.category]?.label ?? s.category,
  fee: s.fee,
  feeNote: s.feeNote,
  inPassport: s.passport ? 'yes' : undefined,
  hours: s.hours,
  visitTime: s.duration,
  where: [s.street, s.area].filter(Boolean).join(' · '),
  fromVenue: fromVenue(s.lat, s.lng),
  about: s.blurb
})).sort((a, b) => a.name.localeCompare(b.name));

const stay = HOTELS.filter(h => h.mapped).map(h => drop({
  name: h.name,
  price: h.priceRange,
  priceNote: h.priceNote,
  rooms: h.rooms,
  where: [h.street, h.area].filter(Boolean).join(' · '),
  fromVenue: fromVenue(h.lat, h.lng),
  about: h.blurb
})).sort((a, b) => a.name.localeCompare(b.name));

const arrivals = START_POINTS.map(p => drop({
  name: p.name,
  note: p.note,
  outsideTheWalls: p.outside ? 'yes' : undefined,
  toVenue: fromVenue(p.lat, p.lng)
}));

/* ── assemble ────────────────────────────────────────────────────────────────── */

const corpus = {
  _generated: new Date().toISOString().slice(0, 10),
  _source: 'node tools/build-corpus.mjs — do not edit by hand; edit data/mirc-2026.json',

  meta: mirc.meta,
  gaps: mirc.gaps ?? [],
  scope: mirc.scope,
  event: mirc.event,
  tracks: mirc.tracks ?? [],
  schedule: mirc.schedule,
  speakers: mirc.speakers,
  papers: mirc.papers,
  venue: mirc.venue,
  registration: mirc.registration,
  logistics: mirc.logistics,
  sessionMembers: mirc.sessionMembers ?? [],
  sessionGuidelines: mirc.sessionGuidelines ?? [],
  faq: mirc.faq,

  localGuide: {
    note: [
      'Places inside the Intramuros walls, from the Intramuros Guide map that hosts this',
      'chatbot. Every one is verified to sit inside the official boundary (OSM relation',
      '103707). Walking times are straight-line from the venue at',
      `${WALK_METRES_PER_MIN} m per minute, so allow a little more on the ground.`
    ].join(' '),
    venueAnchor: VENUE_ANCHOR.name,
    reviewed: DATA_REVIEWED,
    priceCaveat: 'Food prices are indicative estimates for a typical meal per person, not quoted prices. Menus change — treat the band as a guide.',
    feeCaveat: 'Entrance fees are from the Intramuros Administration and site operators. Discounted rates generally apply to students, seniors and PWD — bring ID.',
    stayCaveat: 'Hotel rates are a dated snapshot, not live pricing.',
    priceTiers: Object.values(PRICE_TIERS).map(t => `${t.symbol} ${t.label} — ${t.range}`),
    feeTiers: FEE_TIERS ? Object.values(FEE_TIERS).map(t => `${t.label ?? ''} ${t.range ?? ''}`.trim()) : [],
    passport: INTRAMUROS_PASSPORT ?? null,
    eat: food,
    see: sights,
    stay,
    arrivalPoints: arrivals
  }
};

const out = data('chat-corpus.json');
try {
  writeFileSync(out, JSON.stringify(corpus, null, 2) + '\n', 'utf8');
} catch (err) {
  die('could not write data/chat-corpus.json', err);
}

/* ── report ──────────────────────────────────────────────────────────────────── */

const bytes = JSON.stringify(corpus).length;
const approxTokens = Math.round(bytes / 3.6 / 100) * 100;
const days = mirc.schedule?.days ?? [];
const sessionCount = days.reduce((n, d) => n + (d.items?.length ?? 0), 0);
const parallel = days.flatMap(d => (d.items ?? []).filter(i => i.type === 'parallel'))
  .flatMap(i => i.sessions ?? []);
const paperCount = parallel.reduce((n, s) => n + (s.papers?.length ?? 0), 0);
const keynoteCount = parallel.filter(s => s.keynote).length;
const namedSpeakers = (mirc.speakers ?? []).filter(s => !s.stub).length;

console.log(`\n  ${bold('Chat corpus built')}  ${dim('data/chat-corpus.json')}\n`);
console.log(`  Congress    ${mirc.meta?.name ?? amber('name not set')}`);
console.log(`  Dates       ${mirc.meta?.dates ?? amber('not set')}`);
console.log(`  Programme   ${sessionCount ? `${sessionCount} scheduled items over ${days.length} days` : amber('empty')}`);
console.log(`  Sessions    ${parallel.length ? `${parallel.length} parallel · ${keynoteCount} keynote slots` : amber('none')}`);
console.log(`  Speakers    ${mirc.speakers?.length ? `${namedSpeakers} written up, ${mirc.speakers.length - namedSpeakers} still placeholders` : amber('none')}`);
console.log(`  Papers      ${paperCount ? `${paperCount} presentations` : amber('none')}`);
console.log(`  Members     ${mirc.sessionMembers?.length ?? 0} session assignments`);
console.log(`  Venue       ${corpus.venue.name} · ${corpus.venue.buildings.length} buildings`);
console.log(`  Local guide ${food.length} to eat · ${sights.length} to see · ${stay.length} to stay`);
console.log(`  Size        ${(bytes / 1024).toFixed(0)} KB · roughly ${approxTokens.toLocaleString()} tokens\n`);

if (corpus.gaps.length) {
  console.log(`  ${amber(`${corpus.gaps.length} gaps still open`)} ${dim('— the bot will say these are not published yet:')}`);
  for (const g of corpus.gaps) console.log(dim(`    · ${g}`));
  console.log('');
}

if (!mirc.meta?.contentFrozen) {
  console.log(`  ${amber('Content is not frozen.')} ${dim('Set meta.contentFrozen once the committee signs off.')}\n`);
} else {
  console.log(`  ${green('Content frozen.')}\n`);
}
