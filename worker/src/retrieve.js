/**
 * Retrieval for Dan.
 *
 * The whole corpus is ~43,000 tokens. Re-sending it with every question exhausts
 * Gemini's free per-minute budget after about four questions, and exceeds Groq's
 * free ceiling (8,000/min) so completely that not one request can ever succeed.
 * This module cuts a question-shaped slice out of it instead — typically 2–4k
 * tokens — which is what makes the free tiers usable.
 *
 * No embeddings. The corpus is structured records, not prose, and it is small, so
 * a scored inverted index over the records beats a vector store here: it needs no
 * second API call, no network round trip, nothing to keep in sync, and it matches
 * a paper number or a room code exactly rather than approximately.
 *
 *   buildIndex(corpus)              once per isolate, cached alongside the corpus
 *   retrieve(index, question, opts) -> { slice, picked, tokens }
 *
 * `slice` has the same field names as the corpus so the prompt reads the same way.
 *
 * THE ONE RISK, AND HOW IT IS HANDLED. Retrieval can miss. A miss would otherwise
 * turn into "that is not published", which is a confident wrong answer. So the
 * always-on core carries `gaps` (what genuinely is not published, which stays
 * authoritative) and the slice is explicitly labelled an extract, so Dan can tell
 * "the committee has not supplied this" apart from "I could not find it in what I
 * was given". See `_note` on the slice.
 */

/* Roughly 3.2 bytes per token on this corpus, measured against countTokens. Used
   only to keep the slice inside a budget, so an estimate is fine. */
const BYTES_PER_TOKEN = 3.2;
const estTokens = obj => Math.round(JSON.stringify(obj).length / BYTES_PER_TOKEN);

const STOP = new Set(('a an the and or but if then than that this these those is are was were be been being ' +
  'do does did of in on at to for from by with about into over after before out up down i me my we our you ' +
  'your he she it they them his her its their what which who whom when where why how can could will would ' +
  'shall should may might must have has had there here am please tell know find get give show me some any ' +
  'all also just like need want going go').split(' '));

/** Lowercase, strip accents and punctuation — so "Bagarinao's" matches "bagarinao". */
const norm = s => String(s ?? '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const terms = s => norm(s).split(' ').filter(t => t && t.length > 1 && !STOP.has(t));

/* A five-letter prefix stands in for a stemmer. "present", "presenter",
   "presentation" and "presenting" all collapse to "prese", which is what lets
   "how long do I get to present?" reach a guideline that only ever says
   "presenter". Crude — "present" and "preserve" collapse together too — so a
   prefix hit is scored well below an exact one and never decides a match alone. */
const stemOf = t => (t.length >= 6 ? t.slice(0, 5) : null);

const stems = ts => {
  const out = new Set();
  for (const t of ts) { const s = stemOf(t); if (s) out.add(s); }
  return out;
};

/* ── flattening the corpus into retrievable records ──────────────────────────── */

/**
 * Every record is indexed on a `text` blob and carries the `payload` that goes into
 * the prompt when it is picked. Payloads are made self-contained — a paper carries
 * its session, time, room and keynote — so one hit answers the question without
 * needing its neighbours pulled in too.
 */
function flatten(corpus) {
  const drop2 = o => Object.fromEntries(Object.entries(o).filter(([, v]) =>
    v !== null && v !== undefined && !(Array.isArray(v) && !v.length)));
  const docs = [];
  const add = (kind, text, payload, weight = 1) =>
    docs.push({ kind, text: norm(text), payload, weight });

  const trackName = {};
  for (const t of corpus.tracks ?? []) trackName[t.code] = t.name;

  const roomName = {};
  for (const b of corpus.venue?.buildings ?? []) {
    roomName[b.code] = b.name;
    for (const r of b.rooms ?? []) roomName[`${b.code} ${r.code}`] = r.name ?? r.code;
  }

  /* Where each speaker appears in the programme, so a speaker hit can answer
     "when and where" without the schedule also having to be retrieved. */
  const speakerSlots = new Map();
  const noteSlot = (name, slot) => {
    if (!name) return;
    const k = norm(name);
    if (!speakerSlots.has(k)) speakerSlots.set(k, []);
    speakerSlots.get(k).push(slot);
  };

  for (const day of corpus.schedule?.days ?? []) {
    for (const item of day.items ?? []) {
      if (item.type === 'parallel') {
        for (const s of item.sessions ?? []) {
          noteSlot(s.keynote?.speaker,
            { date: day.date, time: item.time, session: s.session, venue: s.venue });
          for (const t of s.keynote?.talks ?? []) {
            noteSlot(t.speaker, { date: day.date, time: item.time, session: s.session, venue: s.venue });
          }
        }
      } else {
        noteSlot(item.speaker, { date: day.date, time: item.time, session: item.title, venue: item.venue });
      }
    }
  }

  for (const day of corpus.schedule?.days ?? []) {
    for (const item of day.items ?? []) {
      if (item.type !== 'parallel') {
        /* item.type ('plenary', 'event') was never in this text, so "plenary" as a
           query word matched none of these records — only the word "keynote" (which
           lives on the *parallel*-session side) had this problem solved already. A
           plenary speaker's own bio usually also says "plenary" via its label, so
           this query silently fell back to ranking speaker bios against each other
           instead, and five of them tied close enough that which four "won" came
           down to incidental wording, not relevance: a real run returned three
           genuine plenary speakers plus an unrelated keynote speaker, silently
           dropping the fourth plenary speaker. */
        /* A plenary's bio/abstract and a poster session's papers are both left out
           of this payload on purpose. "plenary" alone guarantees all 4 of these
           records a slot regardless of budget (see the INTENTS comment below), so
           a bio+abstract riding along here would be paid for on every plenary
           question whether or not it was the one asked about; each speaker's own
           'speaker'-kind record carries the same bio/abstract for whichever one
           the question actually names, and each poster's abstract is indexed as
           its own 'paper'-kind record just below. */
        add('event',
          `${item.type} ${day.date} ${day.weekday} ${item.time} ${item.title} ${item.venue ?? ''} ` +
          `${item.speaker ?? ''} ${item.affiliation ?? ''} ${roomName[item.venue] ?? ''}`,
          { date: day.date, weekday: day.weekday, ...item, bio: undefined,
            abstract: undefined, keywords: undefined, source: undefined, papers: undefined }, 1.1);

        for (const p of item.papers ?? []) {
          add('paper',
            `${p.id ?? ''} ${p.presenter ?? ''} ${p.title ?? ''} ${p.abstract ?? ''} ` +
            `${(p.keywords ?? []).join(' ')} ${item.title} ${item.venue ?? ''} ${item.time} ${day.date}`,
            { ...p, date: day.date, weekday: day.weekday, session: item.title, venue: item.venue, time: item.time });
        }
        continue;
      }
      for (const s of item.sessions ?? []) {
        const ctx = { date: day.date, weekday: day.weekday, time: item.time,
                      session: s.session, track: s.track, trackName: trackName[s.track],
                      venue: s.venue, venueName: roomName[s.venue] };
        const papersText = (s.papers ?? []).map(p => `${p.id ?? ''} ${p.presenter ?? ''} ${p.title ?? ''}`).join(' ');

        /* A session hit lists its papers by id/presenter/title only, even though
           the papers themselves now carry a full abstract, authors and keywords --
           spreading the enriched objects here would pull every paper's full text
           into the budget the moment anyone asks a session-shaped question ("what's
           on in STEA-4?"), the same record kind used for that. The full paper is
           still one 'paper'-kind hit away, indexed below. */
        const papersLight = (s.papers ?? []).map(p => ({ id: p.id, presenter: p.presenter, title: p.title }));

        add('session',
          `${s.session} ${s.track ?? ''} ${trackName[s.track] ?? ''} ${s.venue ?? ''} ` +
          `${roomName[s.venue] ?? ''} ${item.time} ${day.date} ${day.weekday} ` +
          `${s.keynote?.speaker ?? ''} ${s.keynote?.title ?? ''} ${papersText}`,
          { ...ctx, keynote: s.keynote, papers: papersLight }, 1.2);

        for (const p of s.papers ?? []) {
          add('paper',
            `${p.id ?? ''} ${p.presenter ?? ''} ${p.title ?? ''} ${p.abstract ?? ''} ` +
            `${(p.keywords ?? []).join(' ')} ${s.session} ${s.track ?? ''} ` +
            `${trackName[s.track] ?? ''} ${s.venue ?? ''} ${roomName[s.venue] ?? ''} ${item.time} ${day.date}`,
            { ...p, ...ctx, sessionKeynote: s.keynote?.speaker ?? null });
        }
      }
    }
  }

  for (const sp of corpus.speakers ?? []) {
    const slots = speakerSlots.get(norm(sp.name)) ?? [];
    add('speaker',
      `${sp.name ?? ''} ${sp.label ?? ''} ${sp.track ?? ''} ${trackName[sp.track] ?? ''} ` +
      `${sp.title ?? ''} ${(sp.keywords ?? []).join(' ')} ${sp.bio ?? ''} ${sp.abstract ?? ''}`,
      { ...sp, appearsIn: slots.length ? slots : undefined }, 1.15);
  }

  for (const m of corpus.sessionMembers ?? []) {
    add('member', `${m.session} ${m.date} ${m.time} ${m.venue} ${(m.members ?? []).join(' ')} session member chair`, m);
  }

  /* Guidelines are one-line rules that share most of their vocabulary with each
     other ("presenter", "session"), so word overlap alone cannot tell the rule about
     timing from the rule about certificates. Each line gets the words people
     actually ask it with, and the document's title lines are demoted — position in
     the sheet is not relevance, and boosting the first rows just surfaces the
     header. */
  const guidelineHints = g => {
    const h = [];
    if (/\b\d+\s*minutes?\b/i.test(g)) h.push('how long duration time limit length allocated overrun');
    if (/q\s*&\s*a|question/i.test(g)) h.push('questions answers discussion');
    if (/certificate/i.test(g)) h.push('certificates awarding photo');
    if (/attendance|registration|register/i.test(g)) h.push('attendance sign in link qr');
    if (/arrive|before the session begins|setup|set-up/i.test(g)) h.push('early preparation arrive');
    return h.join(' ');
  };
  for (const g of corpus.sessionGuidelines ?? []) {
    const substantive = g.length > 60;
    add('guideline', `${g} ${guidelineHints(g)}`, g, substantive ? 1.1 : 0.7);
  }

  const lg = corpus.localGuide ?? {};
  for (const e of lg.eat ?? [])
    add('eat', `${e.name} ${e.category ?? ''} ${e.cuisine ?? ''} ${e.where ?? ''} ${e.price ?? ''} ${e.about ?? ''} eat food restaurant cafe`, e);
  for (const e of lg.see ?? [])
    add('see', `${e.name} ${e.category ?? ''} ${e.where ?? ''} ${e.fee ?? ''} ${e.hours ?? ''} ${e.about ?? ''} see sight visit museum heritage`, e);
  for (const e of lg.stay ?? [])
    add('stay', `${e.name} ${e.where ?? ''} ${e.price ?? ''} ${e.about ?? ''} stay hotel sleep accommodation room night`, e);
  for (const a of lg.arrivalPoints ?? [])
    add('arrival', `${a.name} ${a.note ?? ''} arrive arrival transport lrt jeepney ferry station getting there`, a);

  const rs = corpus.registrationStats;
  if (rs) {
    for (const c of rs.byCountry ?? [])
      add('regCountry', `${c.country} registrants registered country delegates how many`, c);
    for (const i of rs.byInstitution ?? [])
      add('regInstitution', `${i.institution} ${i.country ?? ''} registrants registered university how many`, i);
  }

  /* From the conference website: who runs it, who backs it, the key dates, the
     sub-conference the programme workbook does not cover, and the venue's own story.
     Indexed rather than kept always-on — together they are ~700 tokens, which is a
     lot to carry on every question about a coffee shop. */
  const ev = corpus.event ?? {};
  if (ev.about) {
    add('about', `${ev.about} ${corpus.meta?.theme ?? ''} ${corpus.meta?.format ?? ''} ` +
        'what is mirc about overview theme purpose hybrid conference',
        { about: ev.about, theme: corpus.meta?.theme, format: corpus.meta?.format }, 1.2);
  }
  for (const o of ev.organisers ?? []) {
    add('organiser', `${o.role ?? ''} ${o.name ?? ''} ${o.affiliation ?? ''} ` +
        'chair cochair vice chair secretary committee organiser organizer who runs in charge contact',
        o, 1.2);
  }
  if ((ev.partners ?? []).length || ev.sponsor) {
    add('partners', `${(ev.partners ?? []).join(' ')} ${ev.sponsor ?? ''} ` +
        'partner partners institutions sponsor sponsors supported collaborating with',
        drop2({ partners: ev.partners, sponsor: ev.sponsor }), 1.15);
  }
  if (ev.subConference) {
    const { contributedPapers, ...subConferenceInfo } = ev.subConference;
    add('subconference', `${Object.values(subConferenceInfo).join(' ')} ` +
        'sub conference 27 september hospitality tourism saint benilde csb sejong third day',
        subConferenceInfo, 1.25);
    /* Indexed like any other paper, not folded into the record above -- otherwise
       one accepted abstract for the 27th would ride along on every question about
       the sub-conference's existence, and a dozen would make that record too big
       to fit any budget at all. */
    for (const p of contributedPapers ?? []) {
      add('paper',
        `${p.id ?? ''} ${p.presenter ?? ''} ${p.title ?? ''} ${p.abstract ?? ''} ` +
        `${(p.keywords ?? []).join(' ')} hospitality tourism 27 september sub conference`,
        { ...p, event: '27 September Hospitality and Tourism sub-conference, DLSU-CSB' });
    }
  }
  for (const d of corpus.registration?.deadlines ?? []) {
    add('deadline', `${d} deadline dates cut off closed when submission registration abstract`, d, 1.15);
  }
  if (corpus.venue?.about) {
    add('venueAbout', `${corpus.venue.about} plm pamantasan university about history founded ` +
        'charter students campus intramuros', corpus.venue.about, 1.1);
  }

  /* The fields the committee is asked to fill in — registration, logistics, the
     venue's practicalities, a contact address. Until these were indexed they were
     dead: a value typed into logistics.meals never reached the model, because
     core() carries only the venue's name, address and rooms, and nothing else
     read these objects at all. Each field gets the words it is asked with, for the
     same reason the guidelines do — a one-line answer cannot win on overlap. */
  const field = (kind, key, value, hints, weight = 1.2) => {
    if (value === null || value === undefined || (Array.isArray(value) && !value.length)) return;
    const text = Array.isArray(value) ? value.join(' ') : String(value);
    add(kind, `${key} ${text} ${hints}`, { [key]: value }, weight);
  };
  const reg = corpus.registration ?? {};
  field('registration', 'fees', reg.fees, 'registration fee fees cost price how much pay payment rate');
  field('registration', 'howTo', reg.howTo, 'how to register registration online form sign up walk in');
  field('registration', 'desk', reg.desk, 'registration desk where counter check in badge id kit hours open');
  const lgx = corpus.logistics ?? {};
  field('logistics', 'meals', lgx.meals, 'meals food lunch dinner refreshments catering served included');
  field('logistics', 'breaks', lgx.breaks, 'breaks coffee break tea break snacks');
  field('logistics', 'certificates', lgx.certificates, 'certificate certificates attendance participation e-certificate issued');
  field('logistics', 'proceedings', lgx.proceedings, 'proceedings publication published journal indexed isbn');
  field('logistics', 'emergency', lgx.emergency, 'emergency contact hotline medical first aid clinic security');
  field('logistics', 'codeOfConduct', lgx.codeOfConduct, 'code of conduct behaviour harassment policy rules');
  field('logistics', 'photography', lgx.photography, 'photo photography recording pictures filming allowed');
  const v = corpus.venue ?? {};
  field('venueInfo', 'gettingThere', v.gettingThere, 'how to get there directions transport taxi grab drop off entrance gate');
  field('venueInfo', 'accessibility', v.accessibility, 'accessible wheelchair pwd accessibility elevator lift ramp');
  field('venueInfo', 'parking', v.parking, 'parking park car vehicle');
  field('venueInfo', 'wifi', v.wifi, 'wifi wi-fi internet password network');
  field('contact', 'contacts', ev.contacts, 'contact email e-mail phone reach organisers organizers secretariat get in touch');
  field('about', 'audience', ev.audience, 'who is the conference for audience attend participants who should');

  /* General knowledge about PLM itself, as the host institution — history is
     already covered by venueAbout above; these are the newer knowledge areas
     (colleges, campus, services, leadership). Kept as their own light-payload
     fields, not folded into venueAbout, so a question about the gymnasium does
     not also drag in the full college list. See the guaranteed-slot budget note
     on KIND_LIMIT/INTENTS below before adding a heavy field to this kind. */
  field('plm', 'colleges', v.colleges,
    'college colleges school schools department departments academic program programs degree courses course majors major offer offers offered study');
  field('plm', 'campusBuildings', v.campusBuildings,
    'campus building buildings hall chapel gymnasium gym landmark landmarks structures around the campus other buildings');
  field('plm', 'servicesFacilities', v.servicesFacilities,
    'library clinic health service services facility facilities wifi internet gym fitness laboratory laboratories printing press hospital amenities');
  field('plm', 'president', v.president,
    'plm president university president current president head of plm who leads plm who heads plm');

  /* General knowledge about Intramuros itself, not tied to one place on the map --
     founding, walls, wartime history and how to get to and around the district. The
     specific restaurants/sights/hotels already ride the eat/see/stay kinds above; this
     is the connective history and orientation those per-place records do not carry.
     Kept to 4 fields, not 6, and merged along natural topic lines (the war, its
     restoration and its heritage status are one continuous story, not three) -- an
     earlier 6-field draft measured roughly double the worst-case guaranteed-slot cost
     of the 4-field "plm" kind below, because unlike PLM's sub-topics (library vs.
     president vs. colleges), Intramuros's history is one thing a visitor plausibly
     asks for all at once, so more of the fields' own INTENTS entries fired together
     on the same realistic question. See the guaranteed-slot note on KIND_LIMIT/INTENTS
     before adding a 5th field here. */
  const im = corpus.intramuros ?? {};
  field('intramuros', 'overview', im.overview,
    'intramuros founded founding legazpi 1571 name mean capital spanish colonial seat of government');
  field('intramuros', 'wallsAndGates', im.wallsAndGates,
    'walls gates gate bastion bastions fort santiago how thick how high how long muralla murallas puerta');
  field('intramuros', 'history', im.history,
    'world war 2 wwii battle of manila 1945 destroyed destruction restoration rebuilt intramuros administration ' +
    'unesco world heritage national historical landmark national cultural treasure heritage status baroque churches');
  field('intramuros', 'gettingAround', im.gettingAround,
    'how do i get to intramuros lrt jeepney ferry pasig river from the airport e-tranvia tranvia calesa kalesa ' +
    'pedicab bike bicycle bambike getting around walking tour rent rental');

  for (const f of corpus.faq ?? []) add('faq', `${f.q} ${f.a}`, f, 1.2);

  return { docs, trackName, roomName };
}

/* ── index ───────────────────────────────────────────────────────────────────── */

export function buildIndex(corpus) {
  const { docs, trackName, roomName } = flatten(corpus);

  const df = new Map();
  const dfStem = new Map();
  for (const d of docs) {
    d.terms = new Set(terms(d.text));
    d.stems = stems(d.terms);
    for (const t of d.terms) df.set(t, (df.get(t) ?? 0) + 1);
    for (const t of d.stems) dfStem.set(t, (dfStem.get(t) ?? 0) + 1);
  }

  /* Query expansion, built from the corpus itself rather than a hand-written list:
     "health sciences" has to reach the HS track, "Katipunan Lounge" the GEE KL room. */
  const synonyms = new Map();
  const link = (from, to) => {
    const k = norm(from);
    if (!k) return;
    if (!synonyms.has(k)) synonyms.set(k, new Set());
    for (const t of terms(to)) synonyms.get(k).add(t);
  };
  for (const [code, name] of Object.entries(trackName)) { link(code, name); link(name, code); }
  for (const [code, name] of Object.entries(roomName)) { link(code, name); link(name, code); }

  return { corpus, docs, df, dfStem, N: docs.length, synonyms, trackName, roomName };
}

/* ── scoring ─────────────────────────────────────────────────────────────────── */

/* Weights per record kind, so a question that is plainly about food does not get
   its budget eaten by sessions that happen to share a word. */
const KIND_LIMIT = {
  session: 6, paper: 8, speaker: 4, event: 6, member: 4, guideline: 6,
  eat: 6, see: 6, stay: 3, arrival: 6, regCountry: 12, regInstitution: 8, faq: 4,
  about: 2, organiser: 4, partners: 1, subconference: 1, deadline: 6, venueAbout: 1,
  registration: 3, logistics: 3, venueInfo: 2, contact: 1, plm: 4, intramuros: 4
};

/**
 * Intent routing.
 *
 * Word overlap alone ranks badly for questions about a *rule* rather than a thing:
 * "how long do I get to present?" is answered by one short guideline line, which
 * loses on tf-idf to a dozen long speaker bios that also happen to say "present".
 * Ranking cannot fix that — a two-line record can never outscore a 2,000-character
 * one on shared terms — so when a question is plainly of a certain shape, records
 * of the matching kind are guaranteed slots before the general ranking runs.
 */
const INTENTS = [
  [/\b(how long|how many minutes|time limit|allocated|overrun|q ?& ?a|questions? and answers?|certificate|ground rules|session member|moderat|facilitat|attendance|introduce the speaker)\b/i,
    ['guideline'], 3],
  [/\b(eat|eating|food|lunch|dinner|breakfast|coffee|cafe|caf|restaurant|snack|hungry|meal|merienda)\b/i,
    ['eat'], 4],
  [/\b(see|sight|sights|visit|museum|tour|church|fort|cathedral|heritage|attraction)\b/i,
    ['see'], 4],
  [/\b(stay|hotel|sleep|accommodation|overnight|check in)\b/i, ['stay'], 3],
  [/\b(lrt|jeepney|ferry|station|arrive|arriving|getting (?:there|here)|park and ride|how do i get to)\b/i,
    ['arrival'], 3],
  [/\b(how many|registrants?|registered|delegates?|countries|institutions?|turnout|attendance figures?)\b/i,
    ['regCountry', 'regInstitution'], 4],
  [/\b(who is on duty|assigned to|session members?)\b/i, ['member'], 3],
  [/\b(chair|co-?chair|vice-?chair|secretary|committee|organis(?:er|ers)|organiz(?:er|ers)|who runs|in charge)\b/i,
    ['organiser'], 4],
  [/\b(partners?|sponsors?|supported by|collaborat\w*|backed by)\b/i, ['partners'], 1],
  /* "the 27th" scores nothing against a record that says "27 September", and the
     sub-conference is the one part of the congress the programme workbook omits —
     so it is worth routing to explicitly rather than hoping for a term match. */
  [/\b(27th|27 sept\w*|sub-?conference|hospitality|tourism|benilde|csb|sejong|third day)\b/i,
    ['subconference'], 1],
  [/\b(deadlines?|cut-?off|submission clos\w*|abstract submission|key dates?|when did .{0,20}clos)\b/i,
    ['deadline'], 6],
  [/\b(about (?:plm|the university)|history|founded|established|charter\w*|how old)\b/i,
    ['venueAbout'], 1],
  /* PLM's own colleges/campus/services/leadership — a light single-string field
     each (see the "plm" kind above), so guaranteeing a slot here stays cheap
     regardless of budget. Kept specific ("plm president", not bare "president")
     so this never collides with the organiser-committee intent just below. */
  [/\b(colleges?|schools? (?:of|at|in) plm|departments?|academic programs?|degree programs?|majors?|what (?:can|could) i study|what programs?)\b/i,
    ['plm'], 2],
  [/\b(campus buildings?|other (?:plm )?buildings?|gymnasium|plm chapel|arsenio lacson|bahay maynila|landmarks? at plm|around (?:the )?plm campus)\b/i,
    ['plm'], 1],
  [/\b(plm library|plm clinic|health service|plm wifi|plm internet|fitness center|laborator(?:y|ies) at plm|plm facilities|plm services|plm amenities|ospital ng maynila)\b/i,
    ['plm'], 1],
  [/\b(plm president|university president|president of plm|president of the university|who (?:is|leads|heads) plm|current (?:university )?president)\b/i,
    ['plm'], 1],
  /* Intramuros itself, not one place on the map -- founding, walls, wartime history
     and transport. Kept as its own set of guaranteed slots for the same reason the
     guideline/plm intents are: a short history paragraph loses on word overlap to
     the dozens of eat/see records that also mention "Intramuros". One regex per
     field (see the 4-field note above field()) so a single question fires at most
     one of these, not several at once. */
  [/\b(founded|founding|founder|legazpi|when was intramuros|what does intramuros mean|walled city mean)\b/i,
    ['intramuros'], 1],
  [/\b(walls?|gates?|bastions?|puerta|muralla|how (?:thick|high|long|big) (?:is|are) (?:the )?walls?)\b/i,
    ['intramuros'], 1],
  [/\b(world war|wwii|ww2|battle of manila|1945|bombed|destroyed|destruction|rebuilt|restoration|intramuros administration|unesco|world heritage|national historical landmark|national cultural treasure|heritage (?:site|status))\b/i,
    ['intramuros'], 1],
  [/\b(how do i get to intramuros|getting to intramuros|from (?:the )?airport|from naia|nearest lrt|pasig river ferry|e-?tranv[íi]a|tranvia|calesa|kalesa|pedicab|bambike|bike rental|bicycle rental|getting around intramuros|around the walled city)\b/i,
    ['intramuros'], 1],
  [/\b(what is mirc|about the conference|theme|purpose|hybrid|online participation)\b/i,
    ['about'], 1],
  /* There are exactly four plenaries. Even with "plenary" now indexed, leaving this
     to open-ended ranking risks the same failure as the guideline case above: a
     plenary speaker's own bio also contains the word "plenary" (via their own
     label), so a roster question and a single-speaker question can score close
     enough that scoring alone should not be trusted to return all four. */
  [/\bplenary\b/i, ['event'], 4],
  /* The committee's fill-in fields, once filled. Same shape as the guideline case:
     a one-line answer to "is lunch included?" loses on overlap to every eat record
     that says "lunch", so it needs a guaranteed slot. Cheap while a field is still
     null — there is no record to take, and the fallback finds nothing either. */
  [/\b(?:meals?|lunch|dinner|refreshments?|catering|coffee break|tea break|certificates?|proceedings|publication|emergency|first aid|code of conduct|photograph\w*|photos?|record(?:ed|ing)?)\b/i,
    ['logistics'], 2],
  [/\b(?:registration fees?|fees?|how much|payment|pay|how (?:do|can) i register|register(?:ing)? (?:online|on-?site)|registration desk|walk-?in|badge|conference kit)\b/i,
    ['registration'], 3],
  [/\b(?:parking|wheelchair|accessib\w*|pwd|elevator|ramp|wi-?fi|internet|password|directions to|how (?:do|can) i get (?:to|there)|drop-?off)\b/i,
    ['venueInfo'], 2],
  [/\b(?:contact|e-?mail|phone|reach|secretariat|get in touch)\b/i, ['contact'], 1],
];

function intentKinds(question) {
  const out = [];
  for (const [re, kinds, n] of INTENTS) {
    if (re.test(question)) for (const k of kinds) out.push([k, n]);
  }
  return out;
}

function scoreDocs(index, question) {
  const qTerms = terms(question);
  const expanded = new Set(qTerms);

  /* Multi-word synonyms first (so "health sciences" -> HS), then single words. */
  const nq = norm(question);
  for (const [phrase, adds] of index.synonyms) {
    if (phrase.includes(' ') ? nq.includes(phrase) : qTerms.includes(phrase)) {
      for (const a of adds) expanded.add(a);
    }
  }

  /* An explicit identifier in the question — a paper number, a room code — is a
     near-certain intent signal, so it outranks ordinary word overlap. */
  const ids = (question.match(/\b\d{5,7}\b/g) ?? []).map(norm);

  const idf = t => Math.log(1 + index.N / (1 + (index.df.get(t) ?? 0)));
  const idfStem = t => Math.log(1 + index.N / (1 + (index.dfStem.get(t) ?? 0)));

  /* A prefix hit counts for well under half an exact hit, so stemming can rescue a
     question the exact terms miss without letting it outrank a true match. */
  const STEM_WEIGHT = 0.4;

  const scored = [];
  for (const d of index.docs) {
    let s = 0;
    for (const t of expanded) {
      if (d.terms.has(t)) { s += idf(t); continue; }
      const st = stemOf(t);
      if (st && d.stems.has(st)) s += STEM_WEIGHT * idfStem(st);
    }
    if (!s) continue;
    for (const id of ids) if (d.terms.has(id)) s += 40;      // exact identifier hit
    s *= d.weight;
    scored.push({ d, s });
  }
  scored.sort((a, b) => b.s - a.s);
  return scored;
}

/* ── the always-on core ──────────────────────────────────────────────────────── */

/* Small, and needed for almost any answer: who we are, what is in scope, the room
   codes, the caveats, and — critically — `gaps`, which is what lets Dan keep saying
   "the committee has not published that" with authority even from a slice. */
function core(corpus) {
  const lg = corpus.localGuide ?? {};
  return {
    meta: corpus.meta,
    /* Who Dan is — creator, advisers, what he can and cannot do. Always on rather
       than indexed: "who made you?" shares no vocabulary with anything else in the
       corpus, so retrieval could never be relied on to surface it — and the credits
       once lived only in the About dialog and README, which the model never sees. */
    assistant: corpus.assistant,
    /* Everything the prompt reads from scope. `suggestions` is left out: it only
       feeds the chips in the chat panel, and was costing ~60 tokens a question. */
    scope: corpus.scope && {
      inScope: corpus.scope.inScope, outOfScope: corpus.scope.outOfScope,
      decline: corpus.scope.decline, unknown: corpus.scope.unknown
    },
    tracks: corpus.tracks,
    /* "Asia/Manila" — the one line an online delegate abroad needs to read a start
       time, and it sat in schedule.timezone where no slice ever included it. */
    timezone: corpus.schedule?.timezone,
    venue: {
      name: corpus.venue?.name,
      address: corpus.venue?.address,
      buildings: (corpus.venue?.buildings ?? []).map(b => ({
        code: b.code, name: b.name, confirmed: b.confirmed,
        rooms: (b.rooms ?? []).map(r => ({ code: r.code, name: r.name, confirmed: r.confirmed }))
      }))
    },
    gaps: corpus.gaps,
    registrationSummary: corpus.registrationStats
      ? { asOf: corpus.registrationStats.asOf, period: corpus.registrationStats.period,
          reported: corpus.registrationStats.reported, caution: corpus.registrationStats.caution,
          delegateList: corpus.registrationStats.delegateList }
      : undefined,
    caveats: {
      food: lg.priceCaveat, fees: lg.feeCaveat, hotels: lg.stayCaveat,
      walking: `Walking times are straight-line from ${lg.venueAnchor ?? 'the venue'}.`
    }
  };
}

/** Times, session labels and rooms only — no papers. Answers most "what's on / where
 *  is X" questions on its own, and costs a few hundred tokens. */
function outline(corpus) {
  const out = [];
  for (const day of corpus.schedule?.days ?? []) {
    out.push(`— ${day.date} (${day.weekday}) —`);
    for (const item of day.items ?? []) {
      if (item.type === 'parallel') {
        out.push(`${item.time}  ` + (item.sessions ?? [])
          .map(s => `${s.session} in ${s.venue}${s.keynote?.speaker ? ` (keynote ${s.keynote.speaker})` : ''}`)
          .join('; '));
      } else {
        out.push(`${item.time}  ${item.title}${item.venue ? ` — ${item.venue}` : ''}` +
                 `${item.speaker ? ` — ${item.speaker}` : ''}`);
      }
    }
  }
  return out;
}

/* ── retrieve ────────────────────────────────────────────────────────────────── */

export function retrieve(index, question, { budgetTokens = 3000 } = {}) {
  const { corpus } = index;
  const scored = scoreDocs(index, question);

  const picked = [];
  const perKind = {};
  const seen = new Set();
  let used = 0;

  const take = (d, s) => {
    if (seen.has(d)) return false;
    seen.add(d);
    perKind[d.kind] = (perKind[d.kind] ?? 0) + 1;
    picked.push({ kind: d.kind, score: Number(s.toFixed(2)), payload: d.payload });
    used += estTokens(d.payload);
    return true;
  };

  /* Guaranteed slots first, so a question shaped like a rule always gets the rule. */
  for (const [kind, n] of intentKinds(question)) {
    let taken = 0;
    for (const { d, s } of scored) {
      if (taken >= n) break;
      if (d.kind === kind && take(d, s)) taken++;
    }
    /* Nothing scored in that kind — fall back to its first records rather than
       leaving the question unanswerable (e.g. "what can I see?" with no overlap). */
    if (!taken) {
      for (const d of index.docs) {
        if (taken >= n) break;
        if (d.kind === kind && take(d, 0)) taken++;
      }
    }
  }

  for (const { d, s } of scored) {
    if (used >= budgetTokens) break;
    if (seen.has(d)) continue;
    if ((perKind[d.kind] ?? 0) >= (KIND_LIMIT[d.kind] ?? 4)) continue;
    /* Skip anything that would overflow, but keep scanning — a later, smaller
       record may still fit, and a near-full budget should not end the search. */
    if (used + estTokens(d.payload) > budgetTokens) continue;
    take(d, s);
  }

  const grouped = {};
  for (const p of picked) (grouped[p.kind] ??= []).push(p.payload);

  const slice = {
    ...core(corpus),
    programmeOutline: outline(corpus),
    relevant: grouped,
    _note:
      'The "relevant" section is an extract selected for this question, not the whole ' +
      'programme. If something you are asked about is missing from it, say you could not ' +
      'find it and suggest rephrasing or asking at the registration desk — do NOT say it ' +
      'is unpublished. Only the "gaps" list above is authoritative about what the ' +
      'committee has genuinely not supplied.'
  };

  return { slice, picked, tokens: estTokens(slice) };
}
