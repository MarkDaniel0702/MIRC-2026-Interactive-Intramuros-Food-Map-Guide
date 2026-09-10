/**
 * Answer caching for Dan.
 *
 * Groq's free tier allows roughly one request a minute. That is fine for steady
 * use and hopeless for the moment a session ends and two hundred delegates all
 * reach for their phones at once — which is exactly when the assistant is worth
 * having. Most of those questions are the same handful, asked in slightly
 * different words, so they should not each cost a model call.
 *
 * Three tiers, cheapest first:
 *
 *   1. WARM ANSWERS — a reviewed set shipped inside the corpus. Matched without a
 *      network call of any kind, so the commonest questions cost nothing and answer
 *      instantly even when the provider is rate-limited or down.
 *   2. EDGE CACHE — Cloudflare's Cache API, keyed on the normalised question. Free,
 *      needs no binding, and is per-datacenter: for a congress happening in one
 *      building that is a feature, since everyone lands in the same colo and the
 *      second asker gets the first asker's answer.
 *   3. THE MODEL — as before.
 *
 * Only clean answers are cached. Declines, retry messages and errors are not, so a
 * transient failure never becomes a sticky wrong answer.
 *
 * Cache keys carry the corpus's generated-on date, so publishing new content
 * invalidates every entry rather than serving yesterday's programme.
 */

/* Same normalisation the retrieval index uses, so "Where's the STEA track?" and
   "where is the stea track" collapse to the same key. Filler words are dropped
   because they carry no meaning and would otherwise split the cache. */
const FILLER = new Set(('a an the and or of in on at to for from by with is are was do does did ' +
  'can could will would please tell me know i my we our you your what which who when where why how ' +
  'there here about any some just hi hello hey thanks thank').split(' '));

export const normalise = q => String(q ?? '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .split(' ')
  .filter(w => w && !FILLER.has(w))
  .join(' ');

/** FNV-1a — short, stable, and enough to key a cache. Not a security hash. */
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/* ── tier 1: warm answers shipped in the corpus ──────────────────────────────── */

/**
 * A warm answer is used only on a confident match: the same normalised question, or
 * near-identical wording. Deliberately strict — serving a canned answer to a
 * question it does not actually answer is worse than spending a model call, because
 * nothing downstream can catch it.
 */
export function warmAnswer(corpus, question) {
  const warm = corpus.warmAnswers ?? [];
  if (!warm.length) return null;

  const nq = normalise(question);
  if (!nq) return null;
  const qWords = new Set(nq.split(' '));

  let best = null, bestScore = 0;
  for (const entry of warm) {
    for (const key of entry.keys ?? [entry.q]) {
      const nk = normalise(key);
      if (!nk) continue;
      if (nk === nq) return { reply: entry.a, matched: entry.q, score: 1 };

      /* Jaccard over the content words. 0.8 means at most one word differs in a
         five-word question, which is the level at which two questions are really
         the same question. */
      const kWords = new Set(nk.split(' '));
      let shared = 0;
      for (const w of kWords) if (qWords.has(w)) shared++;
      const score = shared / (qWords.size + kWords.size - shared);
      if (score > bestScore) { bestScore = score; best = entry; }
    }
  }
  return bestScore >= 0.8 ? { reply: best.a, matched: best.q, score: Number(bestScore.toFixed(2)) } : null;
}

/* ── tier 2: the edge cache ──────────────────────────────────────────────────── */

const TTL_SECONDS = 60 * 60 * 6;

const cacheKey = (corpus, question) => new Request(
  `https://dan.cache/${corpus?._generated ?? 'v0'}/${hash(normalise(question))}`,
  { method: 'GET' }
);

export async function cachedAnswer(corpus, question) {
  if (typeof caches === 'undefined') return null;          // not in a Worker (tests)
  try {
    const hit = await caches.default.match(cacheKey(corpus, question));
    if (!hit) return null;
    const body = await hit.json();
    return body?.reply ? body : null;
  } catch {
    return null;                                            // a cache miss is not an error
  }
}

/** Store a clean answer. Never called for declines, retries or errors. */
export async function storeAnswer(ctx, corpus, question, payload) {
  if (typeof caches === 'undefined') return;
  try {
    const res = new Response(JSON.stringify(payload), {
      headers: {
        'content-type': 'application/json',
        'cache-control': `max-age=${TTL_SECONDS}`
      }
    });
    const put = caches.default.put(cacheKey(corpus, question), res);
    /* Do not make the asker wait on the write. */
    if (ctx?.waitUntil) ctx.waitUntil(put); else await put;
  } catch { /* caching is best-effort by definition */ }
}
