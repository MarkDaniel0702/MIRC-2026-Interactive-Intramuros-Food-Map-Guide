/**
 * Chatbot corpus builder.
 *
 *   node tools/build-corpus.mjs
 *
 * The chatbot answers only from a single file, public/data/chat-corpus.json. This
 * script builds that file by merging two sources:
 *
 *   1. data/mirc-2026.json  — the congress knowledge base, filled in by the committee.
 *   2. data/*.js            — the map's own food, sights, hotels and arrival points,
 *                             compacted and annotated with a walking time from the venue.
 *
 * The output lives under public/ (not data/) because it must be served at runtime as
 * a static asset — both by the browser (chat.js) and by the Cloudflare Worker, which
 * fetches it from the deployed site's absolute URL. Vite copies public/ verbatim into
 * the build, so this is the one data output that cannot live next to its siblings.
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

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = (...p) => join(root, 'data', ...p);
const importData = p => import(pathToFileURL(data(p)).href);

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

/* Pre-answered common questions, if tools/warm-cache.mjs has been run. Optional —
   without them the assistant behaves exactly as before, just with a model call for
   every question. */
let warm = [];
if (existsSync(data('warm-answers.json'))) {
  try {
    const f = JSON.parse(readFileSync(data('warm-answers.json'), 'utf8'));
    warm = f.answers ?? [];
    /* The warm answers were made against a corpus built at corpusVersion (an ISO
       stamp, so string order is time order). They are stale if the knowledge base
       has been edited since — not merely if the two strings differ, which they
       always do now that one is a timestamp and the other a date. */
    if (f.corpusVersion && mirc.meta?.updated && f.corpusVersion < mirc.meta.updated) {
      console.log(`  ${amber('warm answers were generated against an older corpus')}` +
                  ` ${dim(`(${f.corpusVersion} vs ${mirc.meta?.updated}) — re-run tools/warm-cache.mjs --force`)}`);
    }
  } catch (err) {
    die('could not read data/warm-answers.json', err);
  }
}

let FOOD_SPOTS, PRICE_TIERS, CATEGORIES, DATA_REVIEWED;
let TOURIST_SPOTS, FEE_TIERS, SIGHT_CATEGORIES, VENUE_ANCHOR, WALK_METRES_PER_MIN, INTRAMUROS_PASSPORT;
let HOTELS, START_POINTS, LANDMARKS;
try {
  ({ FOOD_SPOTS, PRICE_TIERS, CATEGORIES, DATA_REVIEWED } = await importData('food-spots.js'));
  ({ TOURIST_SPOTS, FEE_TIERS, SIGHT_CATEGORIES, VENUE_ANCHOR, WALK_METRES_PER_MIN, INTRAMUROS_PASSPORT } =
    await importData('tourist-spots.js'));
  ({ HOTELS } = await importData('hotels.js'));
  ({ START_POINTS } = await importData('start-points.js'));
  ({ LANDMARKS } = await importData('landmarks.js'));
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

/* id/lat/lng ride along on every eat/see/stay record so the Worker can point the
   map at one deterministically (see worker/src/focus.js) -- matched against the
   exact id the React app already keys every marker by (src/data/modes.ts), so
   there is nothing to keep in sync by hand. */
const food = FOOD_SPOTS.map(s => drop({
  id: s.id, lat: s.lat, lng: s.lng,
  name: s.name,
  category: CATEGORIES[s.category]?.label ?? s.category,
  price: `${PRICE_TIERS[s.priceTier].label} — ${PRICE_TIERS[s.priceTier].range} per person`,
  cuisine: Array.isArray(s.cuisine) ? s.cuisine.join(', ') : s.cuisine,
  where: [s.street, s.area].filter(Boolean).join(' · '),
  fromVenue: fromVenue(s.lat, s.lng),
  about: s.blurb
})).sort((a, b) => a.name.localeCompare(b.name));

const sights = TOURIST_SPOTS.map(s => drop({
  id: s.id, lat: s.lat, lng: s.lng,
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
  id: h.id, lat: h.lat, lng: h.lng,
  name: h.name,
  price: h.priceRange,
  priceNote: h.priceNote,
  rooms: h.rooms,
  where: [h.street, h.area].filter(Boolean).join(' · '),
  fromVenue: fromVenue(h.lat, h.lng),
  about: h.blurb
})).sort((a, b) => a.name.localeCompare(b.name));

/* The venue is offered as a start point in the directions panel (data/start-points.js
   `venue: true`), but it is not somewhere a delegate ARRIVES -- and "0 m to the
   venue" would only confuse the model -- so it stays out of this list. */
const arrivals = START_POINTS.filter(p => !p.venue).map(p => drop({
  name: p.name,
  note: p.note,
  outsideTheWalls: p.outside ? 'yes' : undefined,
  toVenue: fromVenue(p.lat, p.lng)
}));

/* The map's landmarks -- the PLM campus and its buildings -- keyed by the same ids the
   React app gives their markers, so worker/src/focus.js can point the map at a
   building ("where is GEE?") exactly as it does at a restaurant. Read ONLY by
   focus.js: nothing here reaches the model, whose knowledge of the buildings and
   rooms comes from `venue.buildings` in mirc-2026.json. That section is matched by
   building code to give each marker two more things to answer to: `rooms`, the
   room codes inside it (AVR, KL, BTB, TOP …), so "where is the AVR?" resolves to
   the building that houses it; and `aliases`, the committee's own name for the
   building and its English form in parentheses ("Katipunan Building"), so the
   question need not use the map's exact label. */
const venueBuildings = Object.fromEntries((mirc.venue?.buildings ?? []).map(b => [b.code, b]));
const landmarks = LANDMARKS.map(lm => {
  const b = venueBuildings[lm.short];
  const aliases = [];
  if (b?.name) {
    aliases.push(b.name);
    const paren = b.name.match(/\(([^)]+)\)/);
    if (paren) aliases.push(paren[1]);
  }
  return drop({
    id: lm.id, lat: lm.lat, lng: lm.lng,
    name: lm.name,
    code: lm.short,
    campus: lm.campus ? 'yes' : undefined,
    aliases: aliases.filter(a => a !== lm.name),
    rooms: (b?.rooms ?? []).map(r => r.code).filter(Boolean)
  });
});
const unmappedBuildings = (mirc.venue?.buildings ?? [])
  .filter(b => !LANDMARKS.some(lm => lm.short === b.code)).map(b => b.code);

/* ── assemble ────────────────────────────────────────────────────────────────── */

const corpus = {
  /* A full timestamp, not a date. The Worker keys its edge cache on this, so two
     builds on the same day must not share it — the second would go on serving
     answers cached against the first. Every rebuild therefore changes this line. */
  _generated: new Date().toISOString(),
  _source: 'node tools/build-corpus.mjs — do not edit by hand; edit data/mirc-2026.json',

  meta: mirc.meta,
  /* Who Dan is — creator, advisers, capabilities. The Worker keeps this in every
     slice (core() in worker/src/retrieve.js); the keys copied here are an explicit
     list, so a new section in mirc-2026.json is invisible until it is named. */
  assistant: mirc.assistant ?? null,
  gaps: mirc.gaps ?? [],
  scope: mirc.scope,
  event: mirc.event,
  tracks: mirc.tracks ?? [],
  schedule: mirc.schedule,
  speakers: mirc.speakers,
  papers: mirc.papers,
  venue: mirc.venue,
  registration: mirc.registration,
  registrationStats: mirc.registrationStats ?? null,
  logistics: mirc.logistics,
  sessionMembers: mirc.sessionMembers ?? [],
  sessionGuidelines: mirc.sessionGuidelines ?? [],
  faq: mirc.faq,
  warmAnswers: warm,

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
    arrivalPoints: arrivals,
    landmarks
  }
};

const out = join(root, 'public', 'data', 'chat-corpus.json');
try {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(corpus, null, 2) + '\n', 'utf8');
} catch (err) {
  die('could not write public/data/chat-corpus.json', err);
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

console.log(`\n  ${bold('Chat corpus built')}  ${dim('public/data/chat-corpus.json')}\n`);
console.log(`  Congress    ${mirc.meta?.name ?? amber('name not set')}`);
console.log(`  Dates       ${mirc.meta?.dates ?? amber('not set')}`);
console.log(`  Programme   ${sessionCount ? `${sessionCount} scheduled items over ${days.length} days` : amber('empty')}`);
console.log(`  Sessions    ${parallel.length ? `${parallel.length} parallel · ${keynoteCount} keynote slots` : amber('none')}`);
console.log(`  Speakers    ${mirc.speakers?.length ? `${namedSpeakers} written up, ${mirc.speakers.length - namedSpeakers} still placeholders` : amber('none')}`);
console.log(`  Papers      ${paperCount ? `${paperCount} presentations` : amber('none')}`);
console.log(`  Members     ${mirc.sessionMembers?.length ?? 0} session assignments`);
console.log(`  Warm        ${warm.length ? `${warm.length} pre-answered questions (no model call)` : amber('none — run tools/warm-cache.mjs')}`);
console.log(`  Venue       ${corpus.venue.name} · ${corpus.venue.buildings.length} buildings`);
console.log(`  Local guide ${food.length} to eat · ${sights.length} to see · ${stay.length} to stay`);
console.log(`  Landmarks   ${landmarks.length} on the map` +
  (unmappedBuildings.length
    ? ` · ${amber(`venue.buildings ${unmappedBuildings.join(', ')} have no marker`)} ${dim('— the map cannot point at them')}`
    : ` · ${dim('every venue building has a marker')}`));
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
