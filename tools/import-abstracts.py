"""
Import paper abstracts, keynote/plenary bios and poster listings into data/mirc-2026.json.

    python tools/import-abstracts.py \
        "MIRC 2026 Presenter Attendance and Information Document.md" \
        "submissions for ID (1).xlsx"

Two sources, order-agnostic (detected by content, like tools/import-program.py):

  · the presenter document  — a per-paper export from the conference system: title,
                              presenter(s) and affiliation, abstract, keywords, and
                              (for invited talks) a bionote. Covers every plenary,
                              keynote, oral and poster paper in the 29-30 September
                              PLM programme. Carries no e-mail addresses.
  · the submissions workbook — the committee's internal export of the same system.
                              Two sheets are read: "submissions (3)" (every
                              submission, whatever its status) and "ID" (the 168
                              accepted PLM oral + poster papers used to badge
                              presenters). Both carry e-mail addresses, which this
                              script never reads into memory beyond discarding them
                              on the same line they are parsed from -- none reach
                              data/mirc-2026.json. Used only where the presenter
                              document has a gap: a few talks its own scrape missed,
                              and papers from the 27 September Hospitality and
                              Tourism sub-conference, which the presenter document
                              does not cover at all.

A third sheet, "NA did not register 32", lists accepted presenters who have not
completed registration. It is never read. Whether a specific person has registered
is exactly the kind of per-individual status this project already keeps out of the
public corpus (see PII_SHEET in import-program.py) -- surfacing it, even in
aggregate, risks going stale and is not something a delegate needs from a chatbot.

What this script does NOT do: decide which numbering a keynote "carries" when the
speakers array and the programme disagree (see the BGL/STEA note it prints below).
It matches people by name, not by label, and never renumbers an existing label.

After running:  node tools/build-corpus.mjs
"""

import html
import json
import re
import sys
import unicodedata
from pathlib import Path

try:
    import openpyxl
except ImportError:
    sys.exit("openpyxl is required:  pip install openpyxl")

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "mirc-2026.json"

_tty = sys.stdout.isatty() and "NO_COLOR" not in __import__("os").environ
amber = (lambda s: f"\x1b[33m{s}\x1b[0m") if _tty else (lambda s: s)
green = (lambda s: f"\x1b[32m{s}\x1b[0m") if _tty else (lambda s: s)
red = (lambda s: f"\x1b[31m{s}\x1b[0m") if _tty else (lambda s: s)

SCIENCESCONF_URL = "https://mirc2026.sciencesconf.org/{}"

# ── text helpers ────────────────────────────────────────────────────────────────

def clean(s):
    if s is None:
        return None
    s = str(s).replace("\xa0", " ").replace("\ufffd", "'")
    s = unicodedata.normalize("NFC", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s or None


def unescape_md(s):
    """Undo the export's markdown escaping and HTML entities -- \\-, &#x201C;, &nbsp; ..."""
    if s is None:
        return None
    s = html.unescape(s)
    s = re.sub(r"\\([!&'\"()\[\]{}.,;:*_#+~<>|`\-])", r"\1", s)
    return clean(s)


HONORIFICS = {"dr", "mr", "mrs", "ms", "prof", "atty", "engr", "hon", "rev", "fr",
              "sr", "jr", "ii", "iii", "iv", "phd", "md", "cpa"}


def name_tokens(name):
    words = re.findall(r"[A-Za-z']+", (name or "").lower())
    return {w for w in words if w not in HONORIFICS and len(w) > 1}


def names_match(a, b):
    """True if every token of the SHORTER name appears in the longer one -- checked
    in whichever direction applies, since sometimes the schedule carries the fuller
    name ("Michael Joseph Dino") and sometimes the speakers array does ("Benjamin
    Leong Tack Hang"). A one-directional check missed exactly this and inserted a
    duplicate speaker entry for someone who already had one."""
    ta, tb = name_tokens(a), name_tokens(b)
    if len(ta) < 2 or len(tb) < 2:
        return False
    return ta <= tb or tb <= ta


def drop(obj):
    return {k: v for k, v in obj.items()
            if v is not None and v != "" and v != [] and v != {}}


NOT_AVAILABLE = re.compile(r"(?i)^(not available\.?|detail page data not available\.?|n/?a\.?)$")


def normalise_abstract(s):
    s = unescape_md(s)
    if not s or NOT_AVAILABLE.match(s):
        return None
    return s


# ── the presenter document ───────────────────────────────────────────────────────

SESSION_RE = re.compile(r"^##\s+\*\*(.+?)\*\*\s*$")
SUBHEAD_RE = re.compile(r"^###\s+\*\*(.+?)\*\*\s*$")
SOURCE_RE = re.compile(r"^\*\*Source:\*\*\s*\[sciencesconf\.org:mirc2026:(\d+)\]\(([^)]+)\)\s*$")
SOURCE_MISSING_RE = re.compile(r"^\*Source:\s*(.+?)\*\s*$")
PRESENTER_RE = re.compile(r"^(.+?)\s+\u2014\s+(.+)$")
LABEL_RE = re.compile(r"^\*\*(Abstract|Bionote|Subject|Topics|Keywords)\s*:?\*\*\s*:?\s*(.*)$", re.I)
ITALIC_NOTE_RE = re.compile(r"^\*[^*].*\*$")
TRACK_SESSION_RE = re.compile(r"^([A-Z]{2,5})-(\d+)$")


def parse_entry_block(title, block):
    doc_id, source_url = None, None
    presenters = []
    abstract_lines, bionote_lines = [], []
    subject = topics = None
    keywords = None
    mode = None

    idx = 0
    while idx < len(block) and not block[idx].strip():
        idx += 1
    if idx < len(block):
        s = clean(block[idx])
        m = SOURCE_RE.match(s or "")
        if m:
            doc_id, source_url = int(m.group(1)), m.group(2)
            idx += 1
        elif SOURCE_MISSING_RE.match(s or ""):
            idx += 1

    while idx < len(block):
        s = clean(block[idx])
        idx += 1
        if not s or s == "&nbsp;":
            continue
        lm = LABEL_RE.match(s)
        if lm:
            label, rest = lm.group(1).lower(), lm.group(2).strip()
            mode = None
            if label == "abstract":
                mode = "abstract"
                if rest:
                    abstract_lines.append(rest)
            elif label == "bionote":
                mode = "bionote"
                if rest:
                    bionote_lines.append(rest)
            elif label == "subject":
                subject = unescape_md(rest)
            elif label == "topics":
                topics = unescape_md(rest)
            elif label == "keywords":
                keywords = [unescape_md(k) for k in re.split(r";", rest) if clean(k)]
            continue
        if mode == "abstract":
            abstract_lines.append(s)
            continue
        if mode == "bionote":
            bionote_lines.append(s)
            continue
        if ITALIC_NOTE_RE.match(s):
            continue
        pm = PRESENTER_RE.match(s)
        if pm and mode is None:
            presenters.append({"name": unescape_md(pm.group(1)),
                                "affiliation": unescape_md(pm.group(2))})

    return {
        "title": title, "docId": doc_id, "sourceUrl": source_url,
        "presenters": presenters,
        "abstract": normalise_abstract(" ".join(abstract_lines)) if abstract_lines else None,
        "bionote": unescape_md(" ".join(bionote_lines)) if bionote_lines else None,
        "subject": subject, "topics": topics, "keywords": keywords,
    }


def parse_presenter_doc(path):
    lines = path.read_text(encoding="utf-8", errors="replace").split("\n")
    entries = []
    session = None
    i, n = 0, len(lines)
    while i < n:
        s = lines[i].strip()
        m = SESSION_RE.match(s)
        if m:
            heading = unescape_md(m.group(1))
            left = heading.split(" \u2014 ")[0].strip() if " \u2014 " in heading else heading
            tm = TRACK_SESSION_RE.match(left)
            session = {"raw": heading, "code": left,
                       "track": tm.group(1) if tm else None,
                       "number": int(tm.group(2)) if tm else None}
            i += 1
            continue
        m = SUBHEAD_RE.match(s)
        if m:
            title = unescape_md(m.group(1))
            j = i + 1
            block = []
            while j < n and not re.match(r"^#{1,3}\s", lines[j].strip()):
                block.append(lines[j])
                j += 1
            entry = parse_entry_block(title, block)
            entry["session"] = session
            entries.append(entry)
            i = j
            continue
        i += 1
    return entries


# ── the submissions workbook ──────────────────────────────────────────────────────

def parse_submissions_sheet(wb):
    """'submissions (3)': every submission the system holds, whatever its status.
    Only 'Accepted' rows are kept -- a refused or still-pending abstract must never
    be presented as part of the programme."""
    if "submissions (3)" not in wb.sheetnames:
        return {}
    ws = wb["submissions (3)"]
    out = {}
    for r in ws.iter_rows(min_row=2, values_only=True):
        if not r or r[0] is None or r[3] != "Accepted":
            continue
        doc_id = int(r[0])
        speakers_field = clean(r[7]) or ""
        names = [clean(n) for n in re.findall(r"([^<>,]+)<[^<>]*>", speakers_field)]
        names = [n for n in names if n]
        labos = clean(r[10]) or ""
        first_lab = None
        m = re.match(r"^\d+\s*-\s*(.+?)(?:,\s*\d+\s*-|$)", labos)
        if m:
            first_lab = clean(m.group(1))
        kw_raw = clean(r[19])
        if kw_raw:
            kw_raw = re.sub(r"(?i)^keywords?:\s*", "", kw_raw)
        out[doc_id] = {
            "title": unescape_md(clean(r[6])),
            "abstract": normalise_abstract(r[5]),
            "authors": [{"name": nm, "affiliation": first_lab} for nm in names] or None,
            "keywords": [unescape_md(k) for k in re.split(r"[;,]", kw_raw) if clean(k)] if kw_raw else None,
            "subject": clean(r[4]),
            "topics": clean(r[18]),
        }
    return out


def parse_id_sheet(wb):
    """'ID': the 168 accepted PLM oral + poster papers used to badge presenters.
    Read only for TOPIC (discipline) and TYPDOC confirmation -- names and
    institutions here duplicate the presenter document; MAIL is never read."""
    if "ID" not in wb.sheetnames:
        return {}
    ws = wb["ID"]
    out = {}
    rows = list(ws.iter_rows(values_only=True))
    for r in rows[1:]:
        if not r or r[6] is None:
            continue
        doc_id = int(r[6])
        out[doc_id] = {"topic": clean(r[7]), "typdoc": clean(r[9]), "session": clean(r[4])}
    return out


# ── merge helpers ────────────────────────────────────────────────────────────────

def source_url_for(doc_id):
    return SCIENCESCONF_URL.format(doc_id) if doc_id else None


def build_catalogue(md_entries, sub_by_id, id_by_id):
    """One record per docId, the presenter document as primary and the workbook as
    fallback for whatever the document's own scrape did not have -- an abstract it
    marked unavailable, or a paper (the 27 September sub-conference) it does not
    cover at all."""
    catalogue = {}
    unresolved_no_id = []

    for e in md_entries:
        doc_id = e["docId"]
        if doc_id is None:
            # No Source link (e.g. a keynote whose public page never got scraped).
            # Recover the id by exact title match against the workbook export.
            hit = next((k for k, v in sub_by_id.items()
                        if clean(v["title"] or "").lower() == clean(e["title"] or "").lower()), None)
            if hit is None:
                unresolved_no_id.append(e["title"])
                continue
            doc_id = hit

        sub = sub_by_id.get(doc_id, {})
        idrow = id_by_id.get(doc_id, {})
        authors = [{"name": p["name"], "affiliation": p["affiliation"]} for p in e["presenters"]] \
            or sub.get("authors")
        # The "ID" sheet is what the committee printed physical badges from, so its
        # TYPDOC/Session are the final word on oral vs. poster -- overriding the
        # presenter document's own **Subject:**, which can be a moment behind a
        # late move from an oral slot to a poster (this happened for three papers).
        catalogue[doc_id] = drop({
            "docId": doc_id,
            "title": e["title"] or sub.get("title"),
            "authors": authors,
            "abstract": e["abstract"] or sub.get("abstract"),
            "bionote": e["bionote"],
            "keywords": e["keywords"] or sub.get("keywords"),
            "subject": idrow.get("typdoc") or e["subject"] or sub.get("subject"),
            "topicTrack": idrow.get("topic") or sub.get("topics") or e["topics"],
            "session": e["session"],
            "idSheetSession": idrow.get("session"),
            "source": source_url_for(doc_id),
        })

    # Papers that exist only in the workbook: the 27 September sub-conference, and
    # anything else the presenter document does not mention at all.
    extra_ids = set(sub_by_id) - set(catalogue)
    for doc_id in extra_ids:
        sub = sub_by_id[doc_id]
        catalogue[doc_id] = drop({
            "docId": doc_id, "title": sub.get("title"), "authors": sub.get("authors"),
            "abstract": sub.get("abstract"), "keywords": sub.get("keywords"),
            "subject": sub.get("subject"), "topicTrack": sub.get("topics"),
            "source": source_url_for(doc_id),
        })

    return catalogue, unresolved_no_id


# ── attaching the catalogue to data/mirc-2026.json ────────────────────────────────

def paper_type(subject):
    s = (subject or "").lower()
    if "poster" in s:
        return "poster"
    if "keynote" in s:
        return "keynote"
    if "plenary" in s:
        return "plenary"
    if "oral" in s:
        return "oral"
    return None


def enrich_paper(p, rec):
    """Add abstract/keywords/authors/source to an existing paper record without
    touching the fields tools/import-program.py already set (id, presenter, title)."""
    if rec.get("abstract"):
        p["abstract"] = rec["abstract"]
    if rec.get("keywords"):
        p["keywords"] = rec["keywords"]
    if rec.get("authors"):
        p["authors"] = rec["authors"]
    if rec.get("subject"):
        p["presentationType"] = rec["subject"]
    if rec.get("source"):
        p["source"] = rec["source"]
    if rec.get("docId") and not p.get("id"):
        p["id"] = str(rec["docId"])


def new_paper_record(rec):
    return drop({
        "id": str(rec["docId"]) if rec.get("docId") else None,
        "presenter": (rec.get("authors") or [{}])[0].get("name"),
        "title": rec.get("title"),
        "abstract": rec.get("abstract"),
        "keywords": rec.get("keywords"),
        "authors": rec.get("authors"),
        "presentationType": rec.get("subject"),
        "source": rec.get("source"),
    })


def norm_title(s):
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def attach_contributed_papers(doc, catalogue, report):
    """Oral and poster papers. Oral papers already exist as records inside
    schedule.days[].items[].sessions[].papers[] (tools/import-program.py); poster
    papers do not exist anywhere yet -- Poster Session 1/2 are single events with
    no paper list.

    A global id lookup runs BEFORE any session-scoped matching, and wins over it.
    The presenter document's own session grouping does not always agree with the
    programme workbook -- one paper it places in BGL-5 already exists, correctly,
    in BGL-4 -- and trusting the document's grouping over an exact id match would
    silently duplicate that paper into the wrong session instead of enriching the
    one place it is actually scheduled."""
    by_session_code = {}
    all_by_id = {}
    for day in doc["schedule"]["days"]:
        for item in day["items"]:
            if item["type"] == "parallel":
                for s in item["sessions"]:
                    by_session_code[s["session"]] = s
                    for p in s.get("papers", []):
                        if p.get("id"):
                            all_by_id[p["id"]] = (p, s["session"])

    poster_events = {}
    for day in doc["schedule"]["days"]:
        for item in day["items"]:
            if item["type"] == "event" and "poster session" in (item.get("title") or "").lower():
                m = re.search(r"poster session (\d)", item["title"], re.I)
                if m:
                    poster_events[int(m.group(1))] = item
                    for p in item.get("papers", []):
                        if p.get("id"):
                            all_by_id[p["id"]] = (p, item["title"])

    matched_id = matched_title = 0
    for doc_id, rec in catalogue.items():
        t = paper_type(rec.get("subject"))
        if t not in ("oral", "poster"):
            continue
        sess = rec.get("session") or {}
        str_id = str(doc_id)

        hit = all_by_id.get(str_id)
        if hit:
            existing, home_label = hit
            enrich_paper(existing, rec)
            matched_id += 1
            claimed = sess.get("code") or sess.get("raw")
            if claimed and norm_title(claimed) not in norm_title(home_label) \
                    and norm_title(home_label) not in norm_title(claimed):
                report["session_mismatch"].append((rec.get("title"), claimed, home_label))
            continue

        if t == "poster":
            poster_hint = rec.get("idSheetSession") or sess.get("raw") or sess.get("code") or ""
            m = re.search(r"poster\s*(\d)", poster_hint, re.I)
            num = int(m.group(1)) if m else None
            event = poster_events.get(num)
            if event is None:
                report["poster_unmatched"].append(rec.get("title"))
                continue
            event.setdefault("papers", []).append(new_paper_record(rec))
            matched_id += 1
            continue

        # oral, no global id hit: try a title match within the claimed session --
        # covers a paper the workbook cell parser could not read as a distinct row
        code = sess.get("code")
        s = by_session_code.get(code)
        if s is None:
            report["oral_unmatched"].append((rec.get("title"), code))
            continue
        nt = norm_title(rec.get("title"))
        title_hit = next((p for p in s.get("papers", []) if norm_title(p.get("title")) == nt), None)
        if title_hit:
            enrich_paper(title_hit, rec)
            matched_title += 1
        else:
            s.setdefault("papers", []).append(new_paper_record(rec))
            report["oral_appended"].append((rec.get("title"), code))

    report["matched_by_id"] = matched_id
    report["matched_by_title"] = matched_title


def attach_keynotes_and_plenaries(doc, catalogue, report):
    """Bios and abstracts for invited talks. Matches by name (every token of the
    existing record's name must appear in the candidate's name), never by label --
    the speakers array's own "KEYNOTE SPEAKER N" numbering does not reliably match
    the session it is actually scheduled into (see the note this script prints)."""
    candidates = [rec for rec in catalogue.values() if paper_type(rec.get("subject")) in ("keynote", "plenary")]

    def best_match(name):
        if len(name_tokens(name)) < 2:
            return None
        for rec in candidates:
            for p in rec.get("authors") or rec.get("presenters") or []:
                cand_name = p.get("name") if isinstance(p, dict) else p
                if names_match(name, cand_name):
                    return rec
        return None

    # 1. plenary items in the schedule (type == 'plenary')
    for day in doc["schedule"]["days"]:
        for item in day["items"]:
            if item["type"] != "plenary":
                continue
            rec = best_match(item.get("speaker"))
            if rec:
                if not item.get("title") and rec.get("title"):
                    item["title"] = rec["title"]
                if rec.get("bionote"):
                    item["bio"] = rec["bionote"]
                if rec.get("abstract"):
                    item["abstract"] = rec["abstract"]
                if rec.get("keywords"):
                    item["keywords"] = rec["keywords"]
                if rec.get("source"):
                    item["source"] = rec["source"]
                report["plenary_matched"] += 1

    # 2. keynote objects nested in parallel sessions
    for day in doc["schedule"]["days"]:
        for item in day["items"]:
            if item["type"] != "parallel":
                continue
            for s in item["sessions"]:
                k = s.get("keynote")
                if not k or not k.get("speaker"):
                    continue
                rec = best_match(k["speaker"])
                if not rec:
                    continue
                if not k.get("title") and rec.get("title"):
                    k["title"] = rec["title"]
                if rec.get("bionote"):
                    k["bio"] = rec["bionote"]
                if rec.get("abstract"):
                    k["abstract"] = rec["abstract"]
                if rec.get("keywords"):
                    k["keywords"] = rec["keywords"]
                if rec.get("source"):
                    k["source"] = rec["source"]
                report["keynote_matched"] += 1

                # 3. the matching (or missing) doc["speakers"] entry
                sp = next((sp for sp in doc["speakers"] if names_match(sp.get("name"), k["speaker"])), None)
                if sp is None:
                    label = f"{s['session']} KEYNOTE"
                    sp = {"label": label, "name": k["speaker"], "kind": "keynote", "track": s.get("track")}
                    doc["speakers"].append(sp)
                    report["speakers_inserted"].append(label)
                if not sp.get("title"):
                    sp["title"] = k.get("title") or rec.get("title")
                if rec.get("bionote") and not sp.get("bio"):
                    sp["bio"] = rec["bionote"]
                if rec.get("abstract") and not sp.get("abstract"):
                    sp["abstract"] = rec["abstract"]
                if rec.get("keywords") and not sp.get("keywords"):
                    sp["keywords"] = rec["keywords"]
                if rec.get("source"):
                    sp["source"] = rec["source"]
                sp["stub"] = not (sp.get("bio") or sp.get("abstract"))
                if not sp["stub"]:
                    report["speakers_filled"].append(sp["label"])

    # Plenary speakers also get the same doc["speakers"] treatment, matched the
    # same way (by name, not by label).
    for sp in doc["speakers"]:
        if sp.get("kind") != "plenary" or not sp.get("stub"):
            continue
        rec = best_match(sp.get("name"))
        if not rec:
            continue
        if rec.get("bionote"):
            sp["bio"] = rec["bionote"]
        if rec.get("abstract"):
            sp["abstract"] = rec["abstract"]
        if rec.get("keywords") and not sp.get("keywords"):
            sp["keywords"] = rec["keywords"]
        if rec.get("source"):
            sp["source"] = rec["source"]
        if not sp.get("title") and rec.get("title"):
            sp["title"] = rec["title"]
        sp["stub"] = not (sp.get("bio") or sp.get("abstract"))
        if not sp["stub"]:
            report["speakers_filled"].append(sp["label"])


def attach_subconference(doc, sub_by_id, id_by_id, report):
    """The 27 September Hospitality and Tourism papers -- accepted abstracts exist
    even though no session-by-session schedule has been supplied for that day.
    Additive only: it does not manufacture a programme, and the existing gap
    saying the detailed programme is missing stays in place."""
    papers = []
    for doc_id, sub in sub_by_id.items():
        if (sub.get("topics") or "") != "Hospitality and Tourism":
            continue
        papers.append(drop({
            "id": str(doc_id), "title": sub.get("title"), "authors": sub.get("authors"),
            "abstract": sub.get("abstract"), "keywords": sub.get("keywords"),
            "presentationType": sub.get("subject"), "source": source_url_for(doc_id),
        }))
    if papers:
        papers.sort(key=lambda p: p.get("title") or "")
        doc["event"].setdefault("subConference", {})["contributedPapers"] = papers
        report["subconference_papers"] = len(papers)


# ── gaps ─────────────────────────────────────────────────────────────────────────

def recompute_gaps(doc, report):
    gaps = doc.get("gaps", [])

    still_missing = []
    for sp in doc["speakers"]:
        if not sp.get("stub"):
            continue
        lack = [w for w, present in (
            ("bio", sp.get("bio")),
            ("talk title", sp.get("title") or sp.get("titleFromProgramme") or sp.get("titleFromSite")),
            ("abstract", sp.get("abstract")),
        ) if not present]
        if lack:
            still_missing.append(f"{sp['label']} ({sp.get('name')}) \u2014 {', '.join(lack)}")
    gaps = [g for g in gaps if not g.startswith("Not yet written up in the speakers document")]
    if still_missing:
        gaps.append("Not yet written up in the speakers document: " + "; ".join(still_missing) +
                     ". Where 'talk title' is not listed for a speaker, the programme already "
                     "carries their title and it can be given.")

    total_papers = sum(len(s.get("papers", [])) for d in doc["schedule"]["days"]
                        for it in d["items"] if it["type"] == "parallel" for s in it["sessions"])
    total_papers += sum(len(it.get("papers", [])) for d in doc["schedule"]["days"]
                         for it in d["items"] if it["type"] == "event")
    with_abstract = sum(1 for d in doc["schedule"]["days"] for it in d["items"]
                         if it["type"] == "parallel" for s in it["sessions"]
                         for p in s.get("papers", []) if p.get("abstract"))
    with_abstract += sum(1 for d in doc["schedule"]["days"] for it in d["items"]
                          if it["type"] == "event" for p in it.get("papers", []) if p.get("abstract"))
    missing_abstract = total_papers - with_abstract
    gaps = [g for g in gaps if not g.startswith("Abstracts for the")]
    if missing_abstract:
        gaps.append(f"Abstracts for {missing_abstract} of the {total_papers} contributed "
                     "oral and poster papers")

    doc["gaps"] = gaps
    report["papers_total"] = total_papers
    report["papers_with_abstract"] = with_abstract


# ── privacy check ─────────────────────────────────────────────────────────────────

# A real TLD is letters only, which "mAP@0.50" (a metric, not an address) is not --
# tightened after that exact false positive turned up in a CV paper's abstract.
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,24}\b")


def assert_no_emails(doc):
    blob = json.dumps(doc, ensure_ascii=False)
    hits = EMAIL_RE.findall(blob)
    if hits:
        sys.exit(f"\n  {red('ABORTED')}  {len(hits)} e-mail-shaped string(s) would have been "
                  f"written to {OUT.relative_to(ROOT)} -- not writing the file.\n"
                  f"  First one: {hits[0]!r}\n")


# ── main ─────────────────────────────────────────────────────────────────────────

def classify(paths):
    md_path = xlsx_path = None
    for p in paths:
        if not p.exists():
            sys.exit(f"No such file: {p}")
        if p.suffix.lower() in (".xlsx", ".xlsm"):
            xlsx_path = p
        else:
            md_path = p
    if not md_path or not xlsx_path:
        sys.exit(__doc__)
    return md_path, xlsx_path


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    md_path, xlsx_path = classify([Path(a) for a in sys.argv[1:]])

    doc = json.loads(OUT.read_text(encoding="utf-8"))

    print(f"\n  Reading {amber(md_path.name)}")
    md_entries = parse_presenter_doc(md_path)
    print(f"  Reading {amber(xlsx_path.name)}")
    wb = openpyxl.load_workbook(xlsx_path, data_only=True)
    sub_by_id = parse_submissions_sheet(wb)
    id_by_id = parse_id_sheet(wb)

    catalogue, unresolved = build_catalogue(md_entries, sub_by_id, id_by_id)

    report = {"oral_unmatched": [], "oral_appended": [], "poster_unmatched": [],
              "session_mismatch": [], "speakers_inserted": [], "speakers_filled": [],
              "plenary_matched": 0, "keynote_matched": 0}

    attach_contributed_papers(doc, catalogue, report)
    attach_keynotes_and_plenaries(doc, catalogue, report)
    attach_subconference(doc, sub_by_id, id_by_id, report)
    recompute_gaps(doc, report)

    assert_no_emails(doc)
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"\n  {green('Written')} {OUT.relative_to(ROOT)}\n")
    print(f"  Presenter document entries   {len(md_entries)}")
    print(f"  Accepted submissions (xlsx)  {len(sub_by_id)}")
    print(f"  Catalogue (merged, by docId) {len(catalogue)}")
    if unresolved:
        print(f"  {amber(str(len(unresolved)) + ' entries with no Source link and no title match')}:")
        for t in unresolved:
            print(f"    \u00b7 {t}")
    print(f"\n  Contributed papers matched by id     {report['matched_by_id']}")
    print(f"  Contributed papers matched by title  {report['matched_by_title']}")
    if report["session_mismatch"]:
        print(f"  {amber(str(len(report['session_mismatch'])) + ' papers: presenter document session disagrees with the programme workbook (workbook wins)')}:")
        for t, claimed, actual in report["session_mismatch"]:
            print(f"    · {t}: document says {claimed}, workbook has it at {actual}")
    if report["oral_appended"]:
        print(f"  {amber(str(len(report['oral_appended'])) + ' oral papers appended (no matching workbook row found)')}:")
        for t, code in report["oral_appended"]:
            print(f"    \u00b7 {code}: {t}")
    if report["oral_unmatched"]:
        print(f"  {red(str(len(report['oral_unmatched'])) + ' oral papers could not be placed in any session')}:")
        for t, code in report["oral_unmatched"]:
            print(f"    \u00b7 {code}: {t}")
    if report["poster_unmatched"]:
        print(f"  {red(str(len(report['poster_unmatched'])) + ' poster papers could not be placed in a poster session')}:")
        for t in report["poster_unmatched"]:
            print(f"    \u00b7 {t}")
    print(f"\n  Plenary talks enriched   {report['plenary_matched']}")
    print(f"  Keynote talks enriched   {report['keynote_matched']}")
    if report["speakers_inserted"]:
        print(f"  Speakers inserted (had no entry at all): {', '.join(report['speakers_inserted'])}")
    if report["speakers_filled"]:
        print(f"  Speakers newly filled in (no longer stubs): {len(set(report['speakers_filled']))}")
    print(f"\n  Papers with an abstract: {report['papers_with_abstract']} / {report['papers_total']}")
    if report.get("subconference_papers"):
        print(f"  27 Sept sub-conference abstracts added: {report['subconference_papers']} "
              f"{amber('(no session-by-session schedule for that day exists -- this does not add one)')}")
    print(f"\n  {green('No e-mail address reached the output file.')}")
    print(f"\n  {amber('Known, unresolved label/session mismatches (left as-is, not renumbered):')}")
    print("    \u00b7 BGL KEYNOTE SPEAKER 3 is labelled twice (Osorio, Manansala) in the speakers array;")
    print("      the programme places Osorio at BGL-3 and Manansala at BGL-4.")
    print("    \u00b7 STEA KEYNOTE SPEAKER 4/5 labels (Padilla, Andres) do not match their session")
    print("      numbers either -- the programme places Andres at STEA-4 and Padilla at STEA-5.")
    print("    \u00b7 Bios/abstracts above were matched by name, so both are filled correctly regardless.")
    print()


if __name__ == "__main__":
    main()
