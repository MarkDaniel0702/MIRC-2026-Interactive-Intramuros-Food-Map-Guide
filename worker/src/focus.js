/**
 * "Find X on the map" — deterministically, not via the model.
 *
 * When a question plainly names one specific eat/see/stay spot, the chat panel
 * flies the map to it and opens its popup (src/hooks/useLeafletMap.ts's
 * `focusById`). Which spot that is comes from here, not from asking the LLM to
 * emit an id: the model can misspell a name, invent one close-but-wrong, or simply
 * not bother, and there is no guard downstream that would catch a wrong id the way
 * there is for a wrong prose answer. Matching against the corpus's own record
 * names is exact by construction — it can only ever point at a place that is
 * really in the data.
 *
 * `focus(corpus, question)` runs independently of retrieval and of which answer
 * tier (warm/cached/model) ends up serving the reply, on the same three arrays
 * retrieve.js already indexes (`corpus.localGuide.eat/see/stay`), so it stays
 * consistent with what Dan is actually grounded in without a second data source.
 *
 * DELIBERATELY CONSERVATIVE. A browsing question ("where can I eat near the
 * venue?") must not fire this — there is no single place to fly to, and yanking
 * the map to an arbitrary top pick would be worse than not moving it. So this
 * only fires on a strong, specific name match, and returns null rather than a
 * best guess whenever that is not met.
 */

const STOP = new Set(('a an the and or of in on at to for is are was were do does did i me my we our ' +
  'you your what which who where when how near by close inside within find show tell me look up going get ' +
  'is there any some can could would please visit see eat stay at from').split(' '));

const norm = s => String(s ?? '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const words = s => norm(s).split(' ').filter(w => w.length > 1 && !STOP.has(w));

/**
 * How confidently `question` names this one record. 1.0 is a full, exact name
 * match; 0 means no meaningful overlap. `minWords` guards short names ("SM",
 * "Ibiza") from matching on a single incidental shared word.
 */
function matchScore(question, name) {
  const qWords = new Set(words(question));
  const nWords = words(name);
  if (!nWords.length) return 0;

  const nq = norm(question);
  const nn = norm(name);
  if (nq.includes(nn)) return 1; // the full name appears verbatim -- as sure as this gets

  const hit = nWords.filter(w => qWords.has(w)).length;
  const minWords = nWords.length <= 2 ? nWords.length : Math.max(2, Math.ceil(nWords.length * 0.6));
  return hit >= minWords ? hit / nWords.length : 0;
}

export function findFocus(corpus, question) {
  if (!question || question.length > 300) return null; // not a "find X" shape

  const lg = corpus.localGuide ?? {};
  const pools = [['eat', lg.eat], ['see', lg.see], ['stay', lg.stay]];

  let best = null;
  const contenders = []; // every record that matched at all, to detect real ambiguity

  for (const [kind, list] of pools) {
    for (const record of list ?? []) {
      if (!record.id || typeof record.lat !== 'number') continue;
      const score = matchScore(question, record.name);
      if (score <= 0) continue;
      contenders.push({ kind, record, score });
      if (!best || score > best.score) best = { kind, record, score };
    }
  }

  if (!best || best.score < 0.6) return null;

  const tied = contenders.filter(c => c.score >= best.score - 0.15);

  if (tied.length > 1) {
    /* Same brand, several branches (e.g. three "Uncle John's") all matched the
       name equally well. Unlike a coincidental word collision between two
       different places, this is worth trying to resolve: if the question also
       names a street or landmark that only one branch's `where` contains, that
       is real disambiguation, not a guess. Only attempted when every tied
       record shares the exact same name -- for two genuinely different places
       (e.g. both matching on "Café"), still say nothing rather than guess. */
    const sameName = tied.every(c => c.record.name === best.record.name);
    if (!sameName) return null;

    /* Word-overlap COUNT, not just presence -- every branch's `where` ends in a
       generic suffix like "Street", so a query that includes it ("cabildo
       street") must not tie every branch on that shared word alone. The branch
       whose street/landmark name is actually named wins by having strictly
       more overlapping words than the rest. */
    const qWords = new Set(words(question));
    const scored = tied.map(c => ({ c, hits: words(c.record.where).filter(w => qWords.has(w)).length }));
    const maxHits = Math.max(...scored.map(s => s.hits));
    if (maxHits === 0) return null;
    const winners = scored.filter(s => s.hits === maxHits);
    if (winners.length !== 1) return null;
    best = winners[0].c;
  }

  return {
    kind: best.kind,
    id: best.record.id,
    name: best.record.name,
    lat: best.record.lat,
    lng: best.record.lng
  };
}
