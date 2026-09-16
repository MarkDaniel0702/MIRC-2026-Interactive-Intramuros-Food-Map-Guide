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
];

let pass = 0, fail = 0;
for (const [question, expectKind, expectName] of CASES) {
  const f = findFocus(corpus, question);
  const ok = expectKind === null ? f === null : (f && f.kind === expectKind && f.name === expectName);
  ok ? pass++ : fail++;
  const got = f ? `${f.kind}:${f.name}` : 'null';
  const want = expectKind === null ? 'null' : `${expectKind}:${expectName}`;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  got ${got.padEnd(28)} want ${want.padEnd(28)} ${question}`);
  if (!ok && f) console.log(`        (also has id=${f.id}, lat=${f.lat}, lng=${f.lng})`);
}

console.log(`\n  ${pass} passed, ${fail} failed of ${CASES.length}\n`);
process.exit(fail ? 1 : 0);
