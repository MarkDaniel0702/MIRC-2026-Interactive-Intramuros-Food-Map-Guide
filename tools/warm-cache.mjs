/**
 * Pre-answer the common questions, so they cost nothing at the congress.
 *
 *   GROQ_API_KEY=...   node tools/warm-cache.mjs
 *   GEMINI_API_KEY=... PROVIDER=gemini node tools/warm-cache.mjs
 *
 * Reads tools/warm-questions.json, answers each through the same prompt, the same
 * retrieval and the same guards the Worker uses, and writes data/warm-answers.json.
 * build-corpus.mjs folds that into the corpus, and the Worker serves a match with no
 * model call at all — which is what lets it keep answering during a coffee break,
 * when the free tier's one-a-minute ceiling would otherwise have it queueing.
 *
 * RESUMABLE. Anything already in data/warm-answers.json is skipped, so a run that is
 * interrupted — or paced across a rate limit — can simply be run again. Pass --force
 * to re-answer everything, e.g. after a content update.
 *
 * REVIEW WHAT IT WRITES. These answers are served verbatim, and none of the runtime
 * guards can catch a bad one. Read data/warm-answers.json before committing it.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildSystemPrompt, looksOffTopic, replyEscapedScope } from '../worker/src/index.js';
import { buildIndex, retrieve } from '../worker/src/retrieve.js';
import { normalise } from '../worker/src/cache.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'data', 'warm-answers.json');
const FORCE = process.argv.includes('--force');

const PROVIDER = process.env.PROVIDER || (process.env.GROQ_API_KEY ? 'groq' : 'gemini');
const KEY = PROVIDER === 'groq' ? process.env.GROQ_API_KEY : process.env.GEMINI_API_KEY;
const MODEL = PROVIDER === 'groq' ? 'openai/gpt-oss-120b' : 'gemini-3.8-flash';
if (!KEY) {
  console.error(`Set ${PROVIDER === 'groq' ? 'GROQ_API_KEY' : 'GEMINI_API_KEY'}. Keys are never read from a file.`);
  process.exit(1);
}

const corpus = JSON.parse(readFileSync(join(root, 'data', 'chat-corpus.json'), 'utf8'));
const index = buildIndex(corpus);
const { questions } = JSON.parse(readFileSync(join(root, 'tools', 'warm-questions.json'), 'utf8'));

const existing = (!FORCE && existsSync(OUT))
  ? JSON.parse(readFileSync(OUT, 'utf8'))
  : { generated: null, corpusVersion: null, answers: [] };
const done = new Map((existing.answers ?? []).map(a => [normalise(a.q), a]));

async function ask(question) {
  const { slice } = retrieve(index, question, { budgetTokens: 2400 });
  const system = buildSystemPrompt(slice);

  const res = PROVIDER === 'groq'
    ? await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          model: MODEL, temperature: 0.2, max_tokens: 700,
          messages: [{ role: 'system', content: system }, { role: 'user', content: question }]
        })
      })
    : await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: question }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 700, thinkingConfig: { thinkingBudget: 0 } }
        })
      });

  if (res.status === 429 || res.status === 503) {
    const body = await res.text();
    const wait = Number((body.match(/"retryDelay":\s*"(\d+)s"/) || [])[1] || 35);
    process.stdout.write(`    (rate limited, waiting ${wait}s)\n`);
    await new Promise(r => setTimeout(r, (wait + 2) * 1000));
    return ask(question);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 140)}`);

  const json = await res.json();
  const text = PROVIDER === 'groq'
    ? (json.choices?.[0]?.message?.content ?? '')
    : (json.candidates?.[0]?.content?.parts?.map(p => p.text).join('') ?? '');
  return text.trim();
}

console.log(`\n  provider ${PROVIDER} · model ${MODEL}`);
console.log(`  ${questions.length} questions, ${done.size} already answered\n`);

/* Keyed by normalised question and seeded from what is already on disk, so a write
   part-way through the run emits the WHOLE set rather than just the questions
   iterated so far. Accumulating into a plain array and writing that was quietly
   destructive: a run killed at position N truncated the file to the first N entries
   and discarded finished answers further down the list. */
const merged = new Map(done);
const write = () => writeFileSync(OUT, JSON.stringify({
  generated: new Date().toISOString().slice(0, 10),
  corpusVersion: corpus._generated,
  answers: questions.map(q => merged.get(normalise(q))).filter(Boolean)
}, null, 2) + '\n', 'utf8');

let asked = 0, skipped = 0, refused = 0;

for (const q of questions) {
  const prior = merged.get(normalise(q));
  if (prior) { skipped++; continue; }

  /* A question that the guards would refuse must never become a warm answer — it
     would be served without the guards ever running. */
  if (looksOffTopic(q)) {
    console.log(`  SKIP (off-topic)  ${q}`);
    refused++;
    continue;
  }

  try {
    const a = await ask(q);
    if (!a || replyEscapedScope(a) || a.includes(corpus.scope.decline.slice(0, 40))) {
      console.log(`  SKIP (refused)    ${q}`);
      refused++;
      continue;
    }
    merged.set(normalise(q), { q, a, keys: [q] });
    asked++;
    console.log(`  OK   ${q}`);
    console.log(`       ${a.replace(/\s+/g, ' ').slice(0, 110)}`);
  } catch (err) {
    console.log(`  FAIL ${q}\n       ${err.message}`);
  }

  write();
  await new Promise(r => setTimeout(r, 1200));
}

write();
console.log(`\n  ${merged.size} warm answers written to data/warm-answers.json`);
console.log(`  ${asked} newly asked, ${skipped} carried over, ${refused} skipped\n`);
console.log('  Read them before committing — they are served verbatim, and none of');
console.log('  the runtime guards run on a warm hit.\n');
console.log('  Then:  node tools/build-corpus.mjs\n');
