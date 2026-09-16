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
 * after a content update: it re-answers what is older than meta.updated and keeps
 * what is not (each answer records the corpus build it came from, in `at`), so a
 * --force run that drops halfway can also just be run again. --force --all redoes
 * everything, which is what a prompt change needs.
 *
 * "I could not find that" is never stored, whatever the run. A warm hit has no second
 * try and no guard behind it, and the prior answer — if there is one — stays instead.
 * Groq's daily budget shows up as a 429 asking for hours; that stops the run rather
 * than looping on it, and it resumes where it stopped when run again.
 *
 * REVIEW WHAT IT WRITES. These answers are served verbatim, and none of the runtime
 * guards can catch a bad one. Read data/warm-answers.json before committing it.
 *
 * PINNED ENTRIES. An entry with `"pinned": true` in data/warm-answers.json was written
 * by hand, not by the model, and survives --force. Use it for the few facts that must
 * come out exactly — the credits, for one — where a model paraphrase gains nothing
 * and a garbled name cannot be caught. Its question must still be listed in
 * tools/warm-questions.json, or the next write() drops it.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildSystemPrompt, looksOffTopic, replyEscapedScope } from '../worker/src/index.js';
import { buildIndex, retrieve } from '../worker/src/retrieve.js';
import { normalise, plainText } from '../worker/src/cache.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'data', 'warm-answers.json');
const FORCE = process.argv.includes('--force');
const ALL = FORCE && process.argv.includes('--all');

const PROVIDER = process.env.PROVIDER || (process.env.GROQ_API_KEY ? 'groq' : 'gemini');
const KEY = PROVIDER === 'groq' ? process.env.GROQ_API_KEY : process.env.GEMINI_API_KEY;
const MODEL = PROVIDER === 'groq' ? 'openai/gpt-oss-120b' : 'gemini-3.8-flash';
if (!KEY) {
  console.error(`Set ${PROVIDER === 'groq' ? 'GROQ_API_KEY' : 'GEMINI_API_KEY'}. Keys are never read from a file.`);
  process.exit(1);
}

const corpus = JSON.parse(readFileSync(join(root, 'public', 'data', 'chat-corpus.json'), 'utf8'));
const index = buildIndex(corpus);
const { questions } = JSON.parse(readFileSync(join(root, 'tools', 'warm-questions.json'), 'utf8'));

const existing = existsSync(OUT)
  ? JSON.parse(readFileSync(OUT, 'utf8'))
  : { generated: null, corpusVersion: null, answers: [] };
/* Every answer already on disk, pinned or not. Under --force the model-written
   ones are re-asked below, but each stays in place until its replacement actually
   arrives: a run that fails on the first question — a bad key, say — must not
   truncate the file to the pinned entries, which is what dropping them here did. */
const done = new Map((existing.answers ?? []).map(a => [normalise(a.q), a]));

/* How long the provider asks us to wait. Groq says it in the message — "try again
   in 1m23.4s", or "3h12m34s" once the daily budget is gone — and sometimes in
   retry-after; Gemini uses a retryDelay field. 35s when none of them say. */
function retryAfterSeconds(res, body) {
  const hdr = Number(res.headers.get('retry-after'));
  if (hdr > 0) return hdr;
  const g = body.match(/try again in (?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i);
  if (g && (g[1] || g[2] || g[3])) return Math.ceil((+g[1] || 0) * 3600 + (+g[2] || 0) * 60 + (+g[3] || 0));
  const d = body.match(/"retryDelay":\s*"(\d+)s"/);
  return d ? Number(d[1]) : 35;
}

/* The could-not-find form, as distinct from the scope.unknown line: "not published
   yet" is a reviewed answer to a real gap and may be warmed; a retrieval or model
   miss may not. */
const couldNotFind = a =>
  /\b(?:could\s*not|couldn['’]t|unable to|did\s*not|didn['’]t|cannot|can['’]t)\s+(?:find|locate)\b/i.test(a);

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
    const wait = retryAfterSeconds(res, body);
    if (wait > 600) {
      /* A wait this long is the daily ceiling, not the per-minute one. Looping on
         it would spin for hours; stop cleanly, and the next run resumes. */
      const err = new Error(`rate limited for ~${Math.round(wait / 60)} min — the daily token budget is ` +
                            'spent. Run again later; it resumes where it stopped.');
      err.fatal = true;
      throw err;
    }
    process.stdout.write(`    (rate limited, waiting ${wait}s)\n`);
    await new Promise(r => setTimeout(r, (wait + 2) * 1000));
    return ask(question);
  }
  if (res.status === 401 || res.status === 403) {
    /* The key is wrong. No question will succeed, so do not try the other 39. */
    const err = new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 140)}`);
    err.fatal = true;
    throw err;
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
/* The stamps move only once something has actually been answered in this run.
   Otherwise a run that failed outright would relabel the old answers as fresh
   against the new corpus, and build-corpus would stop warning that they are not. */
const write = () => writeFileSync(OUT, JSON.stringify({
  generated: asked ? new Date().toISOString().slice(0, 10) : existing.generated,
  corpusVersion: asked ? corpus._generated : existing.corpusVersion,
  answers: questions.map(q => merged.get(normalise(q))).filter(Boolean)
}, null, 2) + '\n', 'utf8');

let asked = 0, skipped = 0, refused = 0;

for (const q of questions) {
  const prior = merged.get(normalise(q));
  if (prior) {
    const fresh = Boolean(prior.at && corpus.meta?.updated && prior.at >= corpus.meta.updated);
    if (prior.pinned || !FORCE || (fresh && !ALL)) { skipped++; continue; }
  }

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
    if (couldNotFind(a)) {
      console.log(`  SKIP (unanswered) ${q}${prior ? '  — keeping the previous answer' : ''}`);
      console.log(`       ${a.replace(/\s+/g, ' ').slice(0, 110)}`);
      refused++;
      continue;
    }
    /* Stored as plain text. The Worker strips markdown on the way out too, but the
       file is read by people, and a reviewed answer should read as it will be seen.
       The guards above ran on the raw reply — the code-fence check needs it. */
    merged.set(normalise(q), { q, a: plainText(a), keys: [q], at: corpus._generated });
    asked++;
    console.log(`  OK   ${q}`);
    console.log(`       ${plainText(a).replace(/\s+/g, ' ').slice(0, 110)}`);
  } catch (err) {
    console.log(`  FAIL ${q}\n       ${err.message}`);
    if (err.fatal) { console.log('\n  Stopping — every remaining question would fail the same way.'); break; }
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
