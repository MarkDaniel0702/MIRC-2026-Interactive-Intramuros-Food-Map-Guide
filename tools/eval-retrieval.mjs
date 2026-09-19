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
const corpus = JSON.parse(readFileSync(join(root, 'public', 'data', 'chat-corpus.json'), 'utf8'));
const index = buildIndex(corpus);

/** Does the rendered slice contain this text anywhere? */
const inSlice = needle => slice => JSON.stringify(slice).toLowerCase().includes(needle.toLowerCase());
const all = (...fns) => slice => fns.every(f => f(slice));
/** At least n records of a kind reached the slice. */
const countIn = (kind, n) => slice => (slice.relevant?.[kind]?.length ?? 0) >= n;
/** Every one of these strings appears somewhere — for a roster that must be
 *  complete, not just plausible. A miss here is a delegate told about three
 *  plenary speakers out of four and having no way to know one was dropped. */
const allOf = (...needles) => slice => needles.every(n => inSlice(n)(slice));

const CASES = [
  ['I am presenting paper 752010. When and where?',       all(inSlice('752010'), inSlice('Baliktanawin'), inSlice('EASS-1'))],
  ['What is paper 747458 about?',                          all(inSlice('747458'), inSlice('Merencilla'))],
  // ── contributed-paper abstracts (tools/import-abstracts.py) ─────────────────
  // Found by topic, not by number — the point of indexing the abstract text
  // itself rather than just id/presenter/title.
  ['Which paper predicts dengue outbreaks using mosquito traps?',
    all(inSlice('747458'), inSlice('Dengue'))],
  // A poster, not an oral paper — Poster Session 1/2 had no papers list at all
  // before the presenter document was imported.
  ['Tell me about the CALM ChatGPT reading intervention poster',
    all(inSlice('743399'), inSlice('Phil-IRI'))],
  // A keynote that was a bare stub (bio, talk title and abstract all null) until
  // tools/import-abstracts.py filled it in from the presenter document.
  ['What is Chad Patrick Osorio\'s keynote about?',
    all(inSlice('Wageningen'), inSlice('Transregional'))],
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
  // A roster question, not a single-speaker one — every plenary speaker must
  // appear, not just the ones that happen to rank highest against a bio that
  // also contains the word "plenary". Caught a real bug: general ranking once
  // returned three of the four plenary speakers plus an unrelated keynote.
  ['Who are the plenary speakers?',
    allOf('Hsiao-Yeh CHU', 'LAGMAN-EUGENIO', 'BAGARINAO', 'JOHARI')],
  // ── about the assistant itself ──────────────────────────────────────────────
  // These share no vocabulary with the programme, so they can only be answered
  // if the "assistant" section rides in the always-on core. Before it did, the
  // credits lived only in the About dialog and README, which the model never sees.
  ['Who made you?',                                        inSlice('Apelledo')],
  ['Who are your advisers?',                               allOf('Apelledo', 'Cortez', 'Medina', 'Manubay')],
  ['Can you show me a place on the map?',                  inSlice('Point the map')],
  ['What time zone are the session times in?',             inSlice('Asia/Manila')],
  // A gap that is named must reach the slice as a gap, or Dan says "try rephrasing"
  // instead of "not published yet".
  ['How do I contact the organisers?',                     inSlice('contact e-mail')],
  ['What size should my poster be?',                       inSlice('Poster and slide requirements')],
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

/* ── the fields the committee is asked to fill ──────────────────────────────────
   These are null today, so the cases above cannot cover them. Fill each one with a
   sentinel in memory and check that a question in its shape surfaces it. Before
   this existed, 15 of these 16 were dead: nothing indexed registration, logistics
   or the venue's practicalities, so a value typed into logistics.meals never reached
   the model — the committee would have filled the field and seen no change. */
const filled = structuredClone(corpus);
filled.logistics = { meals: 'SENTINEL_MEALS', breaks: 'SENTINEL_BREAKS', certificates: 'SENTINEL_CERTS',
  proceedings: 'SENTINEL_PROC', emergency: 'SENTINEL_EMERG', codeOfConduct: 'SENTINEL_COC', photography: 'SENTINEL_PHOTO' };
filled.registration = { ...filled.registration, fees: ['SENTINEL_FEES'], howTo: 'SENTINEL_HOWTO', desk: 'SENTINEL_DESK' };
Object.assign(filled.venue, { parking: 'SENTINEL_PARKING', wifi: 'SENTINEL_WIFI', accessibility: 'SENTINEL_ACCESS', gettingThere: 'SENTINEL_GETTING' });
filled.event = { ...filled.event, contacts: ['SENTINEL_CONTACT'], audience: 'SENTINEL_AUDIENCE' };
const filledIndex = buildIndex(filled);

const FIELD_CASES = [
  ['When are meals served?',              'SENTINEL_MEALS'],
  ['Is lunch included?',                  'SENTINEL_MEALS'],
  ['How long is the coffee break?',       'SENTINEL_BREAKS'],
  ['Do I get a certificate?',             'SENTINEL_CERTS'],
  ['Will there be proceedings?',          'SENTINEL_PROC'],
  ['Emergency contact number?',           'SENTINEL_EMERG'],
  ['What is the code of conduct?',        'SENTINEL_COC'],
  ['Can I take photos?',                  'SENTINEL_PHOTO'],
  ['How much is the registration fee?',   'SENTINEL_FEES'],
  ['How do I register?',                  'SENTINEL_HOWTO'],
  ['Where is the registration desk?',     'SENTINEL_DESK'],
  ['Is there parking at PLM?',            'SENTINEL_PARKING'],
  ['What is the wifi password?',          'SENTINEL_WIFI'],
  ['Is the venue wheelchair accessible?', 'SENTINEL_ACCESS'],
  ['How do I get to the venue?',          'SENTINEL_GETTING'],
  ['How do I contact the organisers?',    'SENTINEL_CONTACT'],
  ['Who is the conference for?',          'SENTINEL_AUDIENCE'],
];

console.log('\n  fields the committee is asked to fill, once filled:');
for (const [question, sentinel] of FIELD_CASES) {
  const { slice, tokens, picked } = retrieve(filledIndex, question, { budgetTokens });
  const ok = inSlice(sentinel)(slice);
  ok ? pass++ : fail++;
  if (!ok) failures.push({ question, tokens, picked: picked.slice(0, 5).map(p => `${p.kind}:${p.score}`) });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${String(tokens).padStart(5)} tok  ${question}`);
}

const full = Math.round(JSON.stringify(corpus).length / 3.2);
console.log(`\n  ${pass} passed, ${fail} failed of ${CASES.length + FIELD_CASES.length}`);
console.log(`  slice: avg ${Math.round(totalTokens / CASES.length)} tok, max ${maxTokens} tok`);
console.log(`  full corpus would be ~${full.toLocaleString()} tok — ` +
            `${(full / (totalTokens / CASES.length)).toFixed(1)}x reduction\n`);

for (const f of failures) {
  console.log(`  FAILED: ${f.question}`);
  console.log(`     picked: ${f.picked.join(', ') || '(nothing)'}\n`);
}
process.exit(fail ? 1 : 0);
