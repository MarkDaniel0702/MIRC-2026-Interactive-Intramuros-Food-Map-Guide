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
 * A fourth array, `localGuide.landmarks` (the PLM campus and its buildings), is
 * tried only when no spot matched -- see findLandmark at the bottom for why it
 * is held to a stricter test.
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
  return findSpot(corpus, question) ?? findLandmark(corpus, question);
}

/** The three tabs' records -- a restaurant, sight or hotel named in the question. */
function findSpot(corpus, question) {
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

/* ── landmarks: the PLM campus and its buildings ─────────────────────────────────
   Pointed at through `corpus.localGuide.landmarks` (tools/build-corpus.mjs), which
   carries each marker's id, name, building code and the room codes the committee
   lists inside it. Two things make this deliberately stricter than findSpot:

   · A LOCATION CUE is required. A restaurant is only ever named when someone means
     that restaurant, but the venue and its buildings are named in half of all
     questions ("which sessions are in GEE tomorrow?", "is registration at PLM
     open?"), and yanking the map to the campus on each would be noise. So this
     fires only when the question reads as "where is / how do I get to / show me".
   · BROWSING questions are excluded. "Where can I eat near the venue?" names the
     venue but asks for a list -- the map has nothing single to fly to, and the
     PLM popup would only cover the very pins the answer is about.

   Matching, in order of confidence: the name or one of the committee's aliases
   for it (matchScore, as for spots -- "Katipunan Building" counts as well as
   "Gusaling Katipunan (GK)"); the building code as a whole word, case-insensitive
   ("gee", "jaa", "gk", "ga", "plm" -- none is an English word); a room code EXACTLY
   as the programme prints it, in upper case ("AVR", "KL", "BTB", "TOP" -- lower-
   case "top" is a plain word, so it never counts). "Where is the venue?" resolves
   through `venue`, an alias of the one top-level (non-campus) landmark. */

const LOCATION_CUE = /\b(?:where|find|show|locat(?:e|ed|ion)|directions?|way to|get to|reach|go(?:ing)? to|walk(?:ing)? to|how far|map|which (?:building|room|hall))\b/i;

/* Checked against every word of the question, not `words()` -- which strips "eat",
   "see", "stay" and "visit" as stop words, the very words this is looking for. */
const BROWSE = new Set(('eat eating food restaurant restaurants cafe cafes coffee lunch dinner breakfast ' +
  'snack snacks drink drinks bar bars hotel hotels stay sleep accommodation sight sights ' +
  'museum museums church churches visit see things').split(' '));

function landmarkScore(question, record) {
  const byName = Math.max(matchScore(question, record.name),
    ...(record.aliases ?? []).map(a => matchScore(question, a)));
  if (byName >= 0.6) return byName;

  const nq = new Set(norm(question).split(' '));
  if (record.code && nq.has(norm(record.code))) return 1;
  if (!record.campus && nq.has('venue')) return 1;

  const raw = new Set(String(question).split(/[^A-Za-z0-9]+/));
  for (const code of record.rooms ?? []) if (raw.has(code)) return 0.9;
  return 0;
}

function findLandmark(corpus, question) {
  const list = corpus.localGuide?.landmarks ?? [];
  if (!list.length || !LOCATION_CUE.test(question)) return null;
  if (norm(question).split(' ').some(w => BROWSE.has(w))) return null;

  let hits = [];
  for (const record of list) {
    if (!record.id || typeof record.lat !== 'number') continue;
    const score = landmarkScore(question, record);
    if (score > 0) hits.push({ record, score });
  }
  if (!hits.length) return null;

  const top = Math.max(...hits.map(h => h.score));
  hits = hits.filter(h => h.score >= top - 0.15);
  /* "Where is GEE at PLM?" names the campus AND a building in it. The building
     is the more specific answer, so the parent gives way; two BUILDINGS named at
     once ("is it in GEE or GK?") is real ambiguity, and stays a null. */
  if (hits.length > 1 && hits.some(h => h.record.campus)) hits = hits.filter(h => h.record.campus);
  if (hits.length !== 1) return null;

  const { record } = hits[0];
  return { kind: 'landmark', id: record.id, name: record.name, lat: record.lat, lng: record.lng };
}
