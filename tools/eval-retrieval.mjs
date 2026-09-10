/**
 * Does retrieval actually find the right record?
 *
 *   node tools/eval-retrieval.mjs [budgetTokens]
 *
 * Runs entirely offline — no API key, no quota, no network. That matters: retrieval
 * quality is the thing most likely to regress when the corpus changes, and it needs
 * to be checkable on every edit without spending a rate-limited budget.
 *
 * Each case asserts that a specific fact reaches the slice. A miss here is worse
 * than a wrong answer, because a missing record is invisible to the model — it
 * cannot answer from something it was never shown.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildIndex, retrieve } from '../worker/src/retrieve.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const budgetTokens = Number(process.argv[2]) || 2400;   // matches RETRIEVAL_BUDGET in the Worker
const corpus = JSON.parse(readFileSync(join(root, 'data', 'chat-corpus.json'), 'utf8'));
const index = buildIndex(corpus);

/** Does the rendered slice contain this text anywhere? */
const inSlice = needle => slice => JSON.stringify(slice).toLowerCase().includes(needle.toLowerCase());
const all = (...fns) => slice => fns.every(f => f(slice));
/** At least n records of a kind reached the slice. */
const countIn = (kind, n) => slice => (slice.relevant?.[kind]?.length ?? 0) >= n;

const CASES = [
  ['I am presenting paper 752010. When and where?',       all(inSlice('752010'), inSlice('Baliktanawin'), inSlice('EASS-1'))],
  ['What is paper 747458 about?',                          all(inSlice('747458'), inSlice('Merencilla'))],
  ['Which room is the HS track in on day one?',            all(inSlice('HS-1'), inSlice('GK BTB'))],
  ['Where are the health sciences sessions?',              inSlice('HS-1')],
  ['Tell me about Dr Bagarinao',                           all(inSlice('Bagarinao'), inSlice('Double-Edged'))],
  ['What is Dr Hsiao-Yeh Chu talking about?',              inSlice('AI-Enabled Smart Manufacturing')],
  ['Who keynotes the first STEA session?',                 all(inSlice('STEA-1'), inSlice('Balbarona'))],
  ['What does BTB stand for?',                             inSlice('Bukod Tanging Bulwagan')],
  ['What does KL stand for?',                              inSlice('Katipunan Lounge')],
  ['How long do I get to present?',                        inSlice('12 minutes')],
  ['What time does registration open?',                    inSlice('Registration')],
  ['When is the closing ceremony?',                        inSlice('Closing')],
  ['Who is on duty for PLENARY 1?',                        all(inSlice('PLENARY 1'), inSlice('Lubao'))],
  ['How many people registered from Malaysia?',            inSlice('MY')],
  ['How many registered from Batangas State University?',  inSlice('Batangas State University')],
  ['Where can I get coffee near the venue?',               inSlice('Coffee')],
  ['Cheap place to eat near PLM?',                         inSlice('Budget')],
  ['What can I see in Intramuros?',                        countIn('see', 3)],
  ['Where can I stay inside the walls?',                   inSlice('Bayleaf')],
  ['How do I get there from the LRT?',                     inSlice('Central Terminal')],
  ['How much is registration?',                            inSlice('Registration fees')],   // a real gap
  ['What is the wifi password?',                           inSlice('Wi-Fi')],               // a real gap
  ['Who is speaking about coral restoration?',             inSlice('Dela Cruz')],
  ['Tell me about the education track',                    inSlice('EASS')],
  // ── from the conference website export ──────────────────────────────────────
  ['Who is the conference chair?',                         inSlice('CORTEZ')],
  ['Is there anything on the 27th?',                       inSlice('Saint Benilde')],
  ['What is the conference theme?',                        inSlice('resilient')],
  ['When was the registration deadline?',                  inSlice('20 August 2026')],
  ['Who are the partner institutions?',                    inSlice('Sejong')],
  ['Tell me about PLM the university',                     inSlice('4196')],
];

let pass = 0, fail = 0, totalTokens = 0, maxTokens = 0;
const failures = [];

for (const [question, expect] of CASES) {
  const { slice, tokens, picked } = retrieve(index, question, { budgetTokens });
  totalTokens += tokens;
  maxTokens = Math.max(maxTokens, tokens);
  const ok = expect(slice);
  ok ? pass++ : fail++;
  if (!ok) failures.push({ question, tokens, picked: picked.slice(0, 5).map(p => `${p.kind}:${p.score}`) });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${String(tokens).padStart(5)} tok  ${question}`);
}

const full = Math.round(JSON.stringify(corpus).length / 3.2);
console.log(`\n  ${pass} passed, ${fail} failed of ${CASES.length}`);
console.log(`  slice: avg ${Math.round(totalTokens / CASES.length)} tok, max ${maxTokens} tok`);
console.log(`  full corpus would be ~${full.toLocaleString()} tok — ` +
            `${(full / (totalTokens / CASES.length)).toFixed(1)}x reduction\n`);

for (const f of failures) {
  console.log(`  FAILED: ${f.question}`);
  console.log(`     picked: ${f.picked.join(', ') || '(nothing)'}\n`);
}
process.exit(fail ? 1 : 0);
