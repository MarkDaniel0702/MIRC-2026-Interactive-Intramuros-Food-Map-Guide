/**
 * Does "find X on the map" point at the right place — and, just as importantly,
 * does it stay silent when there isn't one right place?
 *
 *   node tools/eval-focus.mjs
 *
 * Offline — no key, no quota, no network.
 *
 * The negative cases matter more than the positive ones here. A false positive
 * flies the map to somewhere the user didn't ask about, mid-conversation, which
 * reads as the assistant getting confused rather than as a missing feature. So
 * "where can I eat near the venue" and "find cafe" (real places, but many of them)
 * must return null exactly as reliably as "where is Fort Santiago" must return
 * Fort Santiago.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { findFocus } from '../worker/src/focus.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const corpus = JSON.parse(readFileSync(join(root, 'public', 'data', 'chat-corpus.json'), 'utf8'));

const CASES = [
  // ── must hit the one named place ──
  ['Where is Flower Stories Café?', 'eat', 'Flower Stories Cafe'],
  ['where is flower stories cafe', 'eat', 'Flower Stories Cafe'],
  ['Tell me about the Bayleaf Intramuros', 'stay', 'The Bayleaf Intramuros'],
  ['Show me San Agustin Church', 'see', 'San Agustin Church'],
  ['Where is Fort Santiago?', 'see', 'Fort Santiago'],
  ['How do I get to White Knight Hotel?', 'stay', 'White Knight Hotel Intramuros'],
  ['whats the fee for Casa Manila', 'see', 'Casa Manila'],

  // ── must return nothing — a browse question, not a "find one place" question ──
  ['Where can I eat near the venue?', null],
  ['Where can I get coffee near the venue?', null],
  ['Where can I stay inside the walls?', null],
  ['What can I see in Intramuros?', null],
  ['Cheap place to eat near PLM?', null],
  ['find cafe', null],               // real places, but more than one, none named
  ['where is the coffee shop', null],
  ['What is MIRC 2026?', null],       // not about a place at all
  ['Which room is the HS track in?', null],
  ['What does BTB stand for?', null],

  // ── same-brand, several branches: `name` alone can't tell them apart, so
  //    these check `id` (see below) instead of `name` -- a street or landmark
  //    qualifier must resolve to the one branch it names ──
  ["find uncle john's on cabildo street", 'eat', "Uncle John's", 'uncle-johns-cabildo'],
  ["find uncle john's near andres soriano", 'eat', "Uncle John's", 'uncle-johns-soriano'],
  ["find uncle john's on arzobispo", 'eat', "Uncle John's", 'uncle-johns-arzobispo'],
  ['find 7-eleven on muralla street', 'eat', '7-Eleven', 'seven-eleven-muralla'],
  ['find the 7-eleven on general luna', 'eat', '7-Eleven', 'seven-eleven-general-luna'],

  // ── same brand, no branch named: genuinely ambiguous, must stay silent ──
  ['find 7-eleven', null],
  ["find uncle john's", null],

  // ── the venue and its buildings (localGuide.landmarks) — a stricter test, see
  //    findLandmark in focus.js: a location cue is required, and never on a
  //    browsing question. Answers to the map's label, the committee's building
  //    name, the building code, a room code as the programme prints it ──
  ['Where is the venue?', 'landmark', 'Pamantasan ng Lungsod ng Maynila', 'plm'],
  ['Where is PLM?', 'landmark', 'Pamantasan ng Lungsod ng Maynila', 'plm'],
  ['How do I get to PLM from the LRT?', 'landmark', 'Pamantasan ng Lungsod ng Maynila', 'plm'],
  ['Where is GEE?', 'landmark', 'Gusaling Emilio Ejercito Sr. (GEE)', 'plm-gee'],
  ['Where is the GEE AVR?', 'landmark', 'Gusaling Emilio Ejercito Sr. (GEE)', 'plm-gee'],
  ['Where is the AVR?', 'landmark', 'Gusaling Emilio Ejercito Sr. (GEE)', 'plm-gee'],
  ['Which building is BTB in?', 'landmark', 'Gusaling Katipunan (GK)', 'plm-katipunan'],
  ['How do I get to GA TOP?', 'landmark', 'Gusaling Don Pepe Atienza (GA)', 'plm-ga'],
  ['Where is the Katipunan building?', 'landmark', 'Gusaling Katipunan (GK)', 'plm-katipunan'],
  ['Where is the Emilio Ejercito building?', 'landmark', 'Gusaling Emilio Ejercito Sr. (GEE)', 'plm-gee'],
  ['Where is Justo Albert Auditorium?', 'landmark', 'Justo Albert Auditorium (JAA)', 'plm-jaa'],
  ['Show me the GEE Lobby on the map', 'landmark', 'Gusaling Emilio Ejercito Sr. (GEE)', 'plm-gee'],
  ['Where is GEE at PLM?', 'landmark', 'Gusaling Emilio Ejercito Sr. (GEE)', 'plm-gee'], // building beats campus

  // ── a listed spot named alongside the campus: the spot wins, as before ──
  ['Where is the PLM Canteen?', 'eat', 'PLM Canteen'],
  ['Where is the canteen at PLM?', 'eat', 'PLM Canteen'],

  // ── must stay silent: named in passing, browsing, or ambiguous ──
  ['where is the avr', null],                             // room codes only as printed (upper case)
  ['Where is the top of the wall?', null],                // lower-case "top" is a word, not GA's room
  ['Is the session in GEE or GK? Where are they?', null], // two buildings
  ['Which sessions are in GEE tomorrow?', null],          // no location cue
  ['Is registration at PLM open?', null],
  ['What time does the JAA plenary start?', null],
  ['Where can I get coffee near GEE?', null],             // browsing
  ['What can I see near PLM?', null],
  ['Where can I stay near the venue?', null],
  ['Where do I register?', null],
];

let pass = 0, fail = 0;
for (const [question, expectKind, expectName, expectId] of CASES) {
  const f = findFocus(corpus, question);
  const ok = expectKind === null
    ? f === null
    : (f && f.kind === expectKind && f.name === expectName && (expectId === undefined || f.id === expectId));
  ok ? pass++ : fail++;
  const got = f ? `${f.kind}:${f.id}` : 'null';
  const want = expectKind === null ? 'null' : `${expectKind}:${expectId ?? expectName}`;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  got ${got.padEnd(28)} want ${want.padEnd(28)} ${question}`);
  if (!ok && f) console.log(`        (also has id=${f.id}, lat=${f.lat}, lng=${f.lng})`);
}

console.log(`\n  ${pass} passed, ${fail} failed of ${CASES.length}\n`);
process.exit(fail ? 1 : 0);
