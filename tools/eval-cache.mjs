/**
 * Does the warm-answer matcher fire when it should, and refuse when it shouldn't?
 *
 *   node tools/eval-cache.mjs
 *
 * Offline — no key, no quota, no network.
 *
 * This matters more than it looks. A warm hit skips the model, the retrieval and
 * every guard, and is returned verbatim: it is the one path where a wrong match
 * cannot be caught by anything downstream. "Which room is the HS track in?" matching
 * the BGL answer would send people to the wrong building all day.
 *
 * So the negative cases here are the point. They are questions that look similar to
 * a warmed one and must NOT match.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { normalise, warmAnswer } from '../worker/src/cache.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Synthetic set — always runs, so the matcher is covered even before any answers
   have been generated. */
const synthetic = {
  warmAnswers: [
    { q: 'Where can I eat near the venue?', a: 'EAT', keys: ['Where can I eat near the venue?'] },
    { q: 'How long do I get to present?', a: 'TIME', keys: ['How long do I get to present?'] },
    { q: 'Which room is the HS track in?', a: 'HS', keys: ['Which room is the HS track in?'] },
    { q: 'Which room is the BGL track in?', a: 'BGL', keys: ['Which room is the BGL track in?'] }
  ]
};

const CASES = [
  // should hit
  ['Where can I eat near the venue?', 'EAT'],
  ['where can i eat near the venue', 'EAT'],
  ['Where can I eat near the venue', 'EAT'],
  ['How long do I get to present?', 'TIME'],
  ['How long do we get to present?', 'TIME'],
  ['Which room is the HS track in?', 'HS'],
  ['Which room is the BGL track in?', 'BGL'],

  // must NOT hit — these are the dangerous ones
  ['Which room is the EASS track in?', null],
  ['Where can I stay near the venue?', null],
  ['Where can I eat near the airport?', null],
  ['How long is the coffee break?', null],
  ['How long is the poster session?', null],
  ['Who is the conference chair?', null],
  ['What is the wifi password?', null],
  ['', null]
];

let pass = 0, fail = 0;
console.log('\n  matcher, synthetic set');
for (const [q, want] of CASES) {
  const hit = warmAnswer(synthetic, q);
  const got = hit ? hit.reply : null;
  const ok = got === want;
  ok ? pass++ : fail++;
  const label = want === null ? 'must miss' : `must hit ${want}`;
  console.log(`    ${ok ? 'PASS' : 'FAIL'}  ${(hit ? `hit ${hit.score}` : 'miss').padEnd(9)} ${label.padEnd(14)} ${JSON.stringify(q)}`);
}

/* Real set — once warm answers exist, check that no two of them are close enough to
   match each other's question. That collision is exactly how a delegate would get a
   confident answer to a question they did not ask. */
const warmFile = join(root, 'data', 'warm-answers.json');
if (existsSync(warmFile)) {
  const corpus = JSON.parse(readFileSync(warmFile, 'utf8'));
  const answers = corpus.answers ?? [];
  console.log(`\n  collisions across the ${answers.length} generated answers`);

  let collisions = 0;
  for (const entry of answers) {
    const hit = warmAnswer({ warmAnswers: answers }, entry.q);
    if (!hit || hit.reply !== entry.a) {
      console.log(`    FAIL  "${entry.q}" does not retrieve its own answer`);
      fail++; collisions++;
    } else pass++;
  }

  /* Every warmed question must be nearer to itself than to any other. */
  for (const a of answers) {
    for (const b of answers) {
      if (a === b) continue;
      const hit = warmAnswer({ warmAnswers: [b] }, a.q);
      if (hit) {
        console.log(`    FAIL  "${a.q}"`);
        console.log(`          would be answered by "${b.q}" (score ${hit.score})`);
        fail++; collisions++;
      }
    }
  }
  if (!collisions) { console.log('    PASS  no question matches another\'s answer'); pass++; }
} else {
  console.log('\n  (no data/warm-answers.json yet — run tools/warm-cache.mjs)');
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
