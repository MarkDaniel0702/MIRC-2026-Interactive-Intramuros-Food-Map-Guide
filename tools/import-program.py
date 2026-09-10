"""
Import the committee's source documents into data/mirc-2026.json.

    python tools/import-program.py <any of the source files, in any order>

Four sources, all maintained by the committee, and all optional — pass whichever you
have and the rest is carried over from the last import. Each file is identified by
its contents, not its name or its position on the command line, because they are
updated by different people at different times:

  · the programme workbook  — sheets "Program as of ...", "Proposed Session Members"
                              and "Session Guidelines"
  · the speakers markdown   — plenary and keynote bios, titles and abstracts
  · the registration report — ONLY its aggregate sheets are read. The per-delegate
                              "Source Data" sheet is never touched; see PII_SHEET.
  · the website export      — theme, committee, partners, key dates, venue history,
                              and the 27 September sub-conference at DLSU-CSB, which
                              appears in no other source.

The sources disagree with each other in places, and the disagreements are recorded
rather than resolved: a speaker can be a bare placeholder in the speakers document
while the programme already prints their talk title, and the website and the
registration tabulation give different registration deadlines.

Everything it writes is read from those files. Where a source is a placeholder
("PHOTO / BIONOTE / TITLE / ABSTRACT" with nothing under it) the speaker is marked
`"stub": true` and the missing pieces stay null, so the assistant reports them as
not published rather than inventing them.

This needs Python with openpyxl, unlike tools/build-corpus.mjs which is plain Node.
Run it only when the committee re-exports the workbook; the JSON it produces is the
file that gets committed.

After running:  node tools/build-corpus.mjs
"""

import json
import re
import sys
import unicodedata
from datetime import datetime
from pathlib import Path

try:
    import openpyxl
except ImportError:
    sys.exit("openpyxl is required:  pip install openpyxl")

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "mirc-2026.json"

# Terminal colour, skipped when the output is piped or NO_COLOR is set — same
# convention as tools/verify-in-intramuros.mjs.
_tty = sys.stdout.isatty() and "NO_COLOR" not in __import__("os").environ
amber = (lambda s: f"\x1b[33m{s}\x1b[0m") if _tty else (lambda s: s)


def clean(v, sep=" "):
    """Normalise a cell or line: collapse whitespace, repair mangled punctuation.

    `sep` is what a line break inside the value becomes. Programme cells use the
    line break as a field separator — "STEA Keynote 1\\nDr. Juvy BALBARONA\\n'title'"
    — so those are read with sep=" / " and parsed on the slash. Prose cells keep the
    default and just close up.
    """
    if v is None:
        return None
    s = str(v)
    s = s.replace("\ufffd", "'")               # cp1252 casualties from the export
    s = unicodedata.normalize("NFC", s)
    s = s.replace("\u201c", '"').replace("\u201d", '"')
    s = s.replace("\u2018", "'").replace("\u2019", "'")
    s = re.sub(r"\\([!&'\"()\[\]{}.,;:*_#+~<>|`-])", r"\1", s)   # markdown escapes
    s = re.sub(r"[\r\n]+", sep, s)
    s = re.sub(r"[ \t]+", " ", s).strip()
    s = re.sub(r"(?:\s*/\s*)+$", "", s)        # trailing empty fields
    return s or None


def prose(s):
    """Body text with inline markdown emphasis removed."""
    if not s:
        return None
    s = re.sub(r"\*\*(.+?)\*\*", r"\1", s)
    s = re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"\1", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip() or None


def key(n):
    """Compare people across sources: the three documents punctuate names differently."""
    return re.sub(r"[^a-z]", "", (n or "").lower())


def drop(obj):
    """Strip empty values, so a gap reads as absent rather than as a blank string."""
    return {k: v for k, v in obj.items()
            if v is not None and v != "" and v != [] and v != {}}


def cell(ws, r, c):
    """A programme cell, with its line breaks turned into ' / ' field separators."""
    return clean(ws.cell(r, c).value, sep=" / ")


# ── the programme workbook ───────────────────────────────────────────────────────

TIME = re.compile(r"^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$")
DAY = re.compile(r"^(\d{1,2}\s+\w+\s+\d{4})\s*\((\w+)\)$")
SESSION = re.compile(r"^([A-Z]{2,4})\s*-?\s*(\d+)\s*-\s*Venue:\s*(.+)$", re.I)
NAMED_VENUE = re.compile(r"^(.+?)\s+-\s+Venue:\s*(.+)$")
KEYNOTE = re.compile(r"^/?\s*([A-Z]{2,4})\s+Keynote\s*(\d+)\s*(?:/\s*(.+))?$", re.I)
PAPER = re.compile(r"^(\d{5,7})\s*-\s*(.+?)\s*/\s*(.+)$")
PLENARY = re.compile(r"^PLENARY\s*(\d+)\s*/\s*(.+)$", re.I)


def split_speaker_title(rest):
    """'Dr. Juvy BALBARONA / "Small scale..."' -> (name, title)."""
    if "/" in rest:
        name, title = rest.split("/", 1)
        return clean(name), clean(title).strip('"')
    m = re.match(r'^(.*?)\s*"(.+)"\s*$', rest)
    if m:
        return clean(m.group(1)), clean(m.group(2))
    return clean(rest), None


def parse_program(ws):
    rows = ws.max_row
    days, tracks_seen = [], set()
    day = None
    r = 1
    while r <= rows:
        a = cell(ws, r, 1)

        if a and DAY.match(a):
            m = DAY.match(a)
            day = {"date": m.group(1), "weekday": m.group(2), "items": []}
            days.append(day)
            r += 1
            continue

        if a and TIME.match(a) and day is not None:
            time = a.replace(" ", "").replace("-", " - ")
            # how many parallel columns does this slot use?
            headers = [(c, cell(ws, r, c)) for c in range(2, 7) if cell(ws, r, c)]

            if len(headers) == 1 and not SESSION.match(headers[0][1]):
                # a single whole-conference item: registration, plenary, break…
                text = headers[0][1]
                item = {"time": time, "type": "event", "title": text, "venue": None}
                nv = NAMED_VENUE.match(text)
                if nv:
                    item["title"], item["venue"] = clean(nv.group(1)), clean(nv.group(2))
                p = PLENARY.match(item["title"])
                if p:
                    name, talk = split_speaker_title(p.group(2))
                    aff = None
                    am = re.match(r"^(.*?)\s*\((.+)\)\s*$", name or "")
                    if am:
                        name, aff = clean(am.group(1)), clean(am.group(2))
                    item.update(type="plenary", number=int(p.group(1)),
                                title=talk or f"Plenary {p.group(1)}",
                                speaker=name, affiliation=aff,
                                venue=item["venue"] or "JAA")
                day["items"].append(item)
                r += 1
                continue

            # parallel sessions: header row, then keynote + papers down each column
            end = r + 1
            while end <= rows:
                nxt = cell(ws, end, 1)
                if nxt and (TIME.match(nxt) or DAY.match(nxt)):
                    break
                end += 1

            parallel = []
            for c, head in headers:
                s = SESSION.match(head)
                if s:
                    track, num, venue = s.group(1).upper(), int(s.group(2)), clean(s.group(3))
                    label = f"{track}-{num}"
                    tracks_seen.add(track)
                else:
                    nv = NAMED_VENUE.match(head)
                    track, num = None, None
                    label = clean(nv.group(1)) if nv else head
                    venue = clean(nv.group(2)) if nv else None

                keynote, papers = None, []
                for rr in range(r + 1, end):
                    txt = cell(ws, rr, c)
                    if not txt or txt == "--":
                        continue
                    k = KEYNOTE.match(txt)
                    if k and keynote is None:
                        nm, ttl = split_speaker_title(k.group(3)) if k.group(3) else (None, None)
                        keynote = {"track": k.group(1).upper(), "number": int(k.group(2)),
                                   "speaker": nm, "title": ttl}
                        continue
                    if keynote is None and txt.startswith("/"):
                        # The workshop cell carries several speaker/title pairs in one
                        # go: Name / "Talk" / Name / "Talk". Quoted fields are titles.
                        parts = [clean(x) for x in txt.lstrip("/ ").split("/")]
                        talks, pending = [], None
                        for part in [p for p in parts if p]:
                            if part.startswith('"') or part.endswith('"'):
                                talks.append({"speaker": pending, "title": part.strip('"')})
                                pending = None
                            else:
                                if pending:
                                    talks.append({"speaker": pending, "title": None})
                                pending = part
                        if pending:
                            talks.append({"speaker": pending, "title": None})
                        keynote = {"track": track, "number": num,
                                   "speaker": talks[0]["speaker"] if talks else None,
                                   "title": talks[0]["title"] if talks else None,
                                   "talks": talks if len(talks) > 1 else None}
                        continue
                    p = PAPER.match(txt)
                    if p:
                        papers.append({"id": p.group(1), "presenter": clean(p.group(2)),
                                       "title": clean(p.group(3))})
                    elif not KEYNOTE.match(txt):
                        papers.append({"id": None, "presenter": None, "title": txt})

                parallel.append({"session": label, "track": track, "number": num,
                                 "venue": venue, "keynote": keynote, "papers": papers})

            day["items"].append({"time": time, "type": "parallel", "sessions": parallel})
            r = end
            continue
        r += 1
    return days, sorted(tracks_seen)


def parse_legend(ws):
    """Rows at the foot of the sheet defining the track codes and the venues."""
    tracks, venues = {}, {}
    for r in range(1, ws.max_row + 1):
        for c in range(1, 7):
            v = cell(ws, r, c)
            if not v:
                continue
            m = re.match(r"^([A-Z]{2,4})\s*-\s*(.+)$", v)
            if m and len(m.group(2)) > 12 and "Venue" not in v:
                tracks[m.group(1)] = m.group(2)
            m = re.match(r"^(.+?)\s*\(([A-Z][A-Z ]{1,12})\)\s*$", v)
            if m:
                venues[m.group(2).strip()] = m.group(1).strip()
    return tracks, venues


def parse_members(ws):
    out = []
    header = None
    for r in ws.iter_rows(min_row=1, max_row=ws.max_row, values_only=True):
        vals = [clean(x) for x in r]
        if not any(vals):
            continue
        if header is None and vals[1] == "Date":
            header = True
            continue
        if header and vals[3]:
            date = vals[1]
            if isinstance(r[1], datetime):
                date = r[1].strftime("%d %B %Y")
            elif date:
                date = date.split(" ")[0]
            people = [x for x in vals[5:7] if x]
            out.append({"session": vals[3], "date": date, "time": vals[2],
                        "venue": vals[4], "members": people})
    return out


def parse_guidelines(ws):
    lines = []
    for r in ws.iter_rows(min_row=1, max_row=ws.max_row, values_only=True):
        for c in r:
            v = clean(c)
            if v and not re.match(r"^\d+\.0$", v):
                lines.append(v)
    return lines


# ── the registration tabulation ──────────────────────────────────────────────────

# The workbook's "Source Data" sheet holds one row per delegate: name, e-mail, phone,
# username and Paybox invoicing address. NONE of it is read. data/chat-corpus.json is
# fetched by the Worker over a public URL, so anything in it is published — ingesting
# that sheet would put 239 people's contact and billing details on the open web, which
# is not what they registered for. Only the aggregate sheets are taken.
PII_SHEET = "Source Data"


def parse_registration(path):
    wb = openpyxl.load_workbook(path, data_only=True)

    def rows(sheet, cols=2):
        if sheet not in wb.sheetnames:
            return []
        out = []
        for r in wb[sheet].iter_rows(min_row=2, values_only=True):
            if r and r[0] is not None:
                out.append(tuple(r[:cols]))
        return out

    summary = {}
    if "Executive Summary" in wb.sheetnames:
        for r in wb["Executive Summary"].iter_rows(min_row=1, values_only=True):
            k, v = clean(r[0]), r[1]
            if k and v is not None:
                summary[k] = v

    by_country = [{"country": clean(c), "registrants": n}
                  for c, n in rows("By Country")
                  if clean(c) and clean(c) not in ("Countries",) and isinstance(n, int)]

    by_institution = []
    for r in wb["By Institution"].iter_rows(min_row=2, values_only=True) if "By Institution" in wb.sheetnames else []:
        name = clean(r[0])
        if not name or name.lower().startswith("total number"):
            continue
        by_institution.append(drop({"institution": name, "registrants": r[1],
                                    "speakers": r[2], "total": r[3], "country": clean(r[4])}))

    by_status = [{"status": clean(s), "registrants": n} for s, n in rows("By Status")
                 if clean(s) and isinstance(n, int)]
    monthly = [{"month": clean(m), "registrants": n} for m, n in rows("Monthly Trend")
               if clean(m) and isinstance(n, int)]

    # The sheets disagree with each other on the headline figures. Record that rather
    # than pick one, so Dan quotes a range and says where each number comes from.
    country_sum = sum(x["registrants"] for x in by_country)
    notes = []
    reported_total = summary.get("Total Registrants")
    if reported_total and country_sum and reported_total != country_sum:
        notes.append(f"the Executive Summary says {reported_total} registrants while the "
                     f"By Country sheet adds up to {country_sum}")
    reported_countries = summary.get("Countries Represented")
    if reported_countries and len(by_country) != reported_countries:
        notes.append(f"it says {reported_countries} countries but lists {len(by_country)}")
    reported_inst = summary.get("Institutions Represented")
    if reported_inst and len(by_institution) != reported_inst:
        notes.append(f"it says {reported_inst} institutions but lists {len(by_institution)}")

    return drop({
        "asOf": clean(summary.get("Registration data as of September 2, 2026")) or
                "2 September 2026 as stated inside the report (the file is named 'as of 9 September')",
        "period": clean(summary.get("Registration Period")),
        "reported": drop({
            "totalRegistrants": summary.get("Total Registrants"),
            "registered": summary.get("Registered"),
            "preregistered": summary.get("Preregistered"),
            "countriesRepresented": summary.get("Countries Represented"),
            "institutionsRepresented": summary.get("Institutions Represented"),
        }),
        "caution": ("These totals are not internally consistent — " + "; ".join(notes) +
                    ". Give them as approximate and say which sheet a figure comes from.")
                   if notes else None,
        "byCountry": by_country,
        "byInstitution": by_institution,
        "byStatus": by_status,
        "monthlyTrend": monthly,
        "delegateList": "Not included. The registration workbook's per-delegate sheet "
                        "(names, e-mail addresses, phone numbers, billing addresses) is "
                        "deliberately excluded from this material. Never offer to look up "
                        "an individual registrant's contact details.",
    })


# ── the conference website export ────────────────────────────────────────────────

def parse_site(path):
    """Pull the facts the workbook and the speakers document do not carry.

    This is a scrape of mirc2026.sciencesconf.org, so it is prose with bold labels
    rather than a table. It supplies the theme, the committee, the partners and
    sponsor, the key dates and the venue description — and, importantly, the
    sub-conference on 27 September that the programme workbook does not mention at
    all, plus affiliations and several talk topics for speakers the speakers
    document left as placeholders.
    """
    raw = path.read_text(encoding="utf-8", errors="replace")
    raw = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", raw)            # images
    raw = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", raw)        # links -> their label
    lines = [l for l in (clean(x) for x in raw.split("\n")) if l]

    unbold = lambda s: re.sub(r"\*+", "", s or "").strip()

    site = {"speakers": {}, "committee": [], "keyDates": {}}

    for l in lines:
        flat = unbold(l)

        if flat.startswith("The Manila International Research Conference 2026") and "about" not in site:
            site["about"] = flat
        if "Sub-conference on Hospitality and Tourism" in flat:
            site["subConference"] = flat

        m = re.match(r"^(Conference (?:Chair|Co-Chair|Vice-Chair|Secretary)):\s*(.+)$", flat)
        if m:
            rest = m.group(2)
            am = re.match(r"^(.*?)\s*\((.+)\)\s*$", rest)
            site["committee"].append(drop({
                "role": m.group(1),
                "name": clean(am.group(1)) if am else clean(rest),
                "affiliation": clean(am.group(2)) if am else None}))

        for label, key in (("Call for abstracts", "callForAbstracts"),
                           ("Deadline of submission of abstracts", "abstractDeadline"),
                           ("Acceptance notification", "acceptanceNotification"),
                           ("Release of conference program", "programmeRelease"),
                           ("Registration deadline (presenters and non-presenters)", "registrationDeadline")):
            if flat.startswith(label + ":"):
                site["keyDates"][key] = clean(flat.split(":", 1)[1])

        if flat.startswith("Address:"):
            site["address"] = clean(flat.split(":", 1)[1])
        if flat.startswith("Website:") and "plm.edu.ph" in flat:
            site["venueWebsite"] = clean(flat.split(":", 1)[1])
        if flat.startswith("Pamantasan ng Lungsod ng Maynila (PLM) is the first"):
            site["venueAbout"] = flat
        elif flat.startswith("The university first opened its gates"):
            site["venueAbout"] = (site.get("venueAbout", "") + " " + flat).strip()

    # Speaker bullets: a bold name with a parenthesised affiliation, then usually a
    # "Topic:" line. A blank topic stays blank — the site leaves several unfilled.
    cluster = None
    CLUSTERS = (("Science, Technology, Engineering, Architecture", "STEA"),
                ("Business, Government, Law", "BGL"),
                ("Health Sciences", "HS"),
                ("Education, Arts, Social Science, Social Work", "EASS"))
    for i, l in enumerate(lines):
        flat = unbold(l).strip("_ ")
        for name, code in CLUSTERS:
            if flat == name + " Cluster":
                cluster = code
        if flat == "Plenary Speakers":
            cluster = "PLENARY"
        elif flat == "Special Session Speakers":
            cluster = "SPECIAL"

        m = re.match(r"^\*\s+\*\*(.+?)\s*\((.+?)\)\s*\*\*\s*$", l)
        if not m:
            continue
        nm, aff = clean(m.group(1)), clean(m.group(2))
        topic = None
        for j in range(i + 1, min(i + 4, len(lines))):
            if re.match(r"^\*\s+\*\*", lines[j]):
                break
            tm = re.match(r"^\*?\s*_?Topic:?_?\s*(.*)$", unbold(lines[j]))
            if tm:
                topic = (clean(tm.group(1)) or "").strip("_ ") or None
                break
        site["speakers"][re.sub(r"[^a-z]", "", nm.lower())] = drop(
            {"name": nm, "affiliation": aff, "topic": topic, "cluster": cluster})

    return site


# ── the speakers markdown ────────────────────────────────────────────────────────

MARKER = re.compile(r"^\**\s*((?:PLENARY|[A-Z]{2,4}\s+KEYNOTE)\s+SPEAKER\s*\d+)\s*\**$", re.I)
PLACEHOLDER = re.compile(r"^\**\s*(photo|bionote|title|abstract|keywords?)\s*:?\s*\**$", re.I)


def parse_speakers(md_path):
    raw = md_path.read_text(encoding="utf-8", errors="replace")
    raw = re.sub(r"data:image/[a-z]+;base64,[A-Za-z0-9+/=]+", "", raw)
    raw = re.sub(r"!\[\]\[image\d+\]", "", raw)
    lines = raw.split("\n")

    marks = [(i, MARKER.match(l.strip()).group(1)) for i, l in enumerate(lines)
             if MARKER.match(l.strip())]

    speakers = []
    for n, (i, label) in enumerate(marks):
        end = marks[n + 1][0] if n + 1 < len(marks) else len(lines)
        body = [l for l in (clean(l) for l in lines[i + 1:end]) if l]

        # The placeholders are kept in `body` — "Abstract" on its own line is the
        # delimiter the section structure depends on — but skipped when looking for
        # the name and when deciding whether anything real was written at all.
        content = [l for l in body if not PLACEHOLDER.match(l)]
        if not content:
            speakers.append({"label": label, "name": None, "stub": True})
            continue

        name = content[0].strip("*").strip()
        rest = body[body.index(content[0]) + 1:]
        kind = "plenary" if label.upper().startswith("PLENARY") else "keynote"
        track = None if kind == "plenary" else label.split()[0].upper()

        keywords = None
        for l in list(rest):
            m = re.match(r"^\**\s*Keywords?\s*\**\s*:\s*(.+)$", l, re.I)
            if m:
                keywords = [clean(k).strip("*") for k in re.split(r"[,;]", m.group(1)) if clean(k)]
                rest.remove(l)

        # Structure, not length. These documents run:
        #     name · bio paragraphs · **Title** · author + affiliation · Abstract · text
        # so the title is the first fully-bold line that is not the speaker's own name
        # repeated, and the abstract is what follows the literal "Abstract" marker.
        surname = max(re.findall(r"[A-Za-z-]{4,}", name or ""), key=len, default="~~~").lower()

        def is_name_echo(t):
            return len(t) < 70 and surname in t.lower()

        title, title_at = None, None
        for i, l in enumerate(rest):
            m = re.match(r"^\**\s*(?:Presentation title|Title)\s*\**\s*:\s*(.+)$", l, re.I)
            if m:
                title, title_at = clean(m.group(1)).strip("*").strip('"'), i
                break
            # A bold line, or one wrapped in quotes — some entries give the talk
            # title as a plain quoted line with no emphasis at all.
            m = re.match(r"^\*\*(.+?)\*\*$", l) or re.match(r'^"(.+)"$', l)
            if m:
                t = clean(m.group(1)).strip('"').strip()
                if 12 < len(t) < 260 and not is_name_echo(t):
                    title, title_at = t, i
                    break

        abstract_at = next((i for i, l in enumerate(rest)
                            if re.match(r"^\**\s*abstract\s*\**\s*:?\s*$", l, re.I)), None)

        def paragraphs(seq):
            """Every prose paragraph in the zone, in order — a bio is often three."""
            out = [prose(x) for x in seq
                   if len(x) > 80 and not re.fullmatch(r"\*\*.+\*\*", x)
                   and not PLACEHOLDER.match(x)]
            return "\n\n".join(o for o in out if o) or None

        if abstract_at is not None:
            abstract = paragraphs(rest[abstract_at + 1:])
            bio_zone = rest[:title_at if title_at is not None else abstract_at]
        else:
            after = rest[title_at + 1:] if title_at is not None else []
            abstract = paragraphs(after)
            bio_zone = rest[:title_at] if title_at is not None else rest
        bio = paragraphs(bio_zone)

        # A title found *after* the abstract marker is a false positive.
        if title_at is not None and abstract_at is not None and title_at > abstract_at:
            title = None

        speakers.append({
            "label": label, "name": name, "kind": kind, "track": track,
            "title": title, "bio": bio, "abstract": abstract, "keywords": keywords,
            "stub": not (bio or abstract),
        })
    return speakers


# ── assemble ─────────────────────────────────────────────────────────────────────

def classify(paths):
    """Work out what each file is from its contents, not its position or its name.

    The four sources are maintained by different people and arrive at different
    times, so the importer takes any subset, in any order, and leaves whatever is
    not supplied exactly as it already stands in data/mirc-2026.json.
    """
    found = {"workbook": None, "speakers": None, "registration": None, "site": None}
    for p in paths:
        if not p.exists():
            sys.exit(f"No such file: {p}")
        if p.suffix.lower() in (".xlsx", ".xlsm"):
            names = openpyxl.load_workbook(p, read_only=True).sheetnames
            if any(n.lower().startswith("program") for n in names):
                found["workbook"] = p
            elif any("summary" in n.lower() or "country" in n.lower() for n in names):
                found["registration"] = p
            else:
                sys.exit(f"Unrecognised workbook (sheets: {names}): {p}")
        else:
            head = p.read_text(encoding="utf-8", errors="replace")[:20000]
            if re.search(r"(PLENARY|KEYNOTE)\s+SPEAKER\s*\d", head, re.I):
                found["speakers"] = p
            else:
                found["site"] = p
    return found


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = classify([Path(a) for a in sys.argv[1:]])
    xlsx, md = src["workbook"], src["speakers"]
    reg_path, site_path = src["registration"], src["site"]

    doc = json.loads(OUT.read_text(encoding="utf-8"))

    if xlsx:
        wb = openpyxl.load_workbook(xlsx, data_only=True)
        prog_sheet = next(s for s in wb.sheetnames if s.lower().startswith("program"))
        ws = wb[prog_sheet]
        days, tracks_seen = parse_program(ws)
        track_names, venue_names = parse_legend(ws)
        members = (parse_members(wb["Proposed Session Members"])
                   if "Proposed Session Members" in wb.sheetnames else [])
        guidelines = (parse_guidelines(wb["Session Guidelines"])
                      if "Session Guidelines" in wb.sheetnames else [])
        prog_sheet_label = f"{xlsx.name} / sheet '{prog_sheet}'"
    else:
        # Not supplied this run — keep what the last import produced.
        days = doc.get("schedule", {}).get("days", [])
        tracks_seen = sorted(t["code"] for t in doc.get("tracks", []))
        track_names = {t["code"]: t.get("name") for t in doc.get("tracks", [])}
        venue_names = {}
        members = doc.get("sessionMembers", [])
        guidelines = doc.get("sessionGuidelines", [])
        prog_sheet_label = doc.get("schedule", {}).get("source", "(carried over)")

    speakers = parse_speakers(md) if md else doc.get("speakers", [])

    doc["meta"].update({
        "name": "Manila International Research Conference 2026",
        "updated": datetime.now().strftime("%Y-%m-%d"),
    })
    doc["meta"].setdefault("dates", "29-30 September 2026 (Tuesday-Wednesday)")

    doc["tracks"] = [{"code": c, "name": track_names.get(c)} for c in tracks_seen]
    doc["schedule"] = {"timezone": "Asia/Manila", "source": prog_sheet_label, "days": days}
    doc["speakers"] = speakers
    doc["sessionMembers"] = members
    doc["sessionGuidelines"] = guidelines

    site = parse_site(site_path) if site_path else None
    if site:
        doc["meta"]["website"] = "https://mirc2026.sciencesconf.org"
        doc["meta"]["theme"] = ("The role of Artificial Intelligence, sustainability and "
                                "innovation in building resilient, inclusive and future-ready "
                                "communities")
        doc["meta"]["format"] = "Hybrid — onsite and online"
        # The workbook covers 29-30 September only. The congress is longer than that.
        doc["meta"]["dates"] = ("27-30 September 2026: a Hospitality and Tourism "
                                "sub-conference at DLSU-CSB on 27 September, and the main "
                                "conference at PLM on 29-30 September (Tuesday-Wednesday)")
        doc["event"]["about"] = site.get("about")
        doc["event"]["organisers"] = site["committee"]
        doc["event"]["partners"] = [
            "De La Salle - College of Saint Benilde", "Sejong University", "NU Fairview",
            "International Cultural Communication Center Malaysia (ICCCM)",
            "International Transnational Education Association (ITEA)",
            "DOST - PCIEERD Balik Scientist Program",
            "CCSD - SciencesConf (France), which provides the conference website"]
        doc["event"]["sponsor"] = "C&E Group (CE-Logic, Inc.)"
        doc["event"]["subConference"] = drop({
            "what": site.get("subConference"),
            "date": "27 September 2026",
            "venue": "De La Salle - College of Saint Benilde (DLSU-CSB), Manila",
            "note": ("Its detailed programme is not in the material — the session-by-session "
                     "workbook covers only the 29-30 September days at PLM.")})
        LABELS = {"callForAbstracts": "Call for abstracts opened",
                  "abstractDeadline": "Abstract submission deadline",
                  "acceptanceNotification": "Acceptance notifications",
                  "programmeRelease": "Conference programme released",
                  "registrationDeadline": "Registration deadline"}
        deadlines = [f"{LABELS.get(k, k)}: {v}" for k, v in site["keyDates"].items()]
        # The website and the registration tabulation disagree about when registration
        # shut. Say so rather than pick one — a delegate acting on the wrong date is
        # exactly the failure this assistant exists to avoid.
        reg_close = site["keyDates"].get("registrationDeadline")
        if reg_close:
            deadlines.append(
                f"Note: the conference website gives the registration deadline as {reg_close}, "
                "while the registration tabulation reports sign-ups continuing to 1 September 2026. "
                "Registration is closed either way; anyone asking about late or on-site "
                "registration should be sent to the organisers.")
        doc["registration"]["deadlines"] = deadlines or doc["registration"].get("deadlines")
        if site.get("address"):
            doc["venue"]["address"] = site["address"]
        doc["venue"]["about"] = site.get("venueAbout")
        doc["venue"]["website"] = site.get("venueWebsite") or doc["venue"].get("website")

        # Affiliation and topic for speakers the speakers document left bare.
        for sp in doc["speakers"]:
            hit = site["speakers"].get(key(sp.get("name") or ""))
            if not hit:
                continue
            sp.setdefault("affiliation", hit.get("affiliation"))
            if not sp.get("title") and not sp.get("titleFromProgramme") and hit.get("topic"):
                sp["titleFromSite"] = hit["topic"]

    registration = parse_registration(reg_path) if reg_path else None
    if registration:
        doc["registrationStats"] = registration
        # The tabulation counts who registered, not what it cost — but it does pin the
        # window, which answers "can I still sign up?".
        if registration.get("period") and not doc["registration"].get("deadlines"):
            doc["registration"]["deadlines"] = [
                f"Registration ran {registration['period']} and has closed. "
                "Anyone asking about late or on-site registration should be sent to the organisers."
            ]

    # Room codes the programme legend now confirms.
    legend_rooms = {}
    for code, full in venue_names.items():
        legend_rooms[code.replace(" ", "")] = full
    for b in doc["venue"]["buildings"]:
        for room in b.get("rooms", []):
            room_key = b["code"] + room["code"]
            if room_key in legend_rooms:
                room["name"] = legend_rooms[room_key]
                room["confirmed"] = True
        if b["code"] in legend_rooms and not b.get("confirmed"):
            b["confirmed"] = True

    papers = sum(len(s["papers"]) for d in days for it in d["items"]
                 if it["type"] == "parallel" for s in it["sessions"])
    stubs = [s["label"] for s in speakers if s.get("stub")]

    # Derive the gaps from what actually landed, rather than editing a hand-kept list.
    # Anything named here, the assistant reports as not published yet.
    gaps = []

    # The two sources disagree about the same person: a speaker can be a bare
    # placeholder in the speakers document while the programme already prints their
    # talk title. Saying the title is unpublished when the programme carries it is a
    # confidently wrong answer, so the programme's title is attached to the speaker
    # and only what is genuinely absent is reported as a gap.
    prog_titles = {}
    def note_title(speaker, title):
        if speaker and title:
            prog_titles.setdefault(key(speaker), title)

    for d in days:
        for it in d["items"]:
            if it["type"] == "plenary":
                note_title(it.get("speaker"), it.get("title"))
            elif it["type"] == "parallel":
                for s in it["sessions"]:
                    k = s.get("keynote") or {}
                    note_title(k.get("speaker"), k.get("title"))
                    for t in (k.get("talks") or []):
                        note_title(t.get("speaker"), t.get("title"))

    for sp in speakers:
        if sp.get("name") and not sp.get("title"):
            t = prog_titles.get(key(sp["name"]))
            if t:
                sp["titleFromProgramme"] = t

    if stubs:
        missing = []
        for sp in speakers:
            if not sp.get("stub"):
                continue
            lack = [w for w, present in (
                ("bio", sp.get("bio")),
                ("talk title", sp.get("title") or sp.get("titleFromProgramme") or sp.get("titleFromSite")),
                ("abstract", sp.get("abstract")),
            ) if not present]
            missing.append(f"{sp['label']} ({sp.get('name')}) — {', '.join(lack)}")
        gaps.append(
            "Not yet written up in the speakers document: " + "; ".join(missing) +
            ". Where 'talk title' is not listed for a speaker, the programme already "
            "carries their title and it can be given.")

    unnamed = [s["session"] for d in days for it in d["items"] if it["type"] == "parallel"
               for s in it["sessions"] if s["keynote"] and not s["keynote"]["speaker"]]
    if unnamed:
        gaps.append("Keynote speaker not yet named for " + ", ".join(unnamed))

    if not any(p.get("abstract") for d in days for it in d["items"]
               if it["type"] == "parallel" for s in it["sessions"] for p in s["papers"]):
        gaps.append(f"Abstracts for the {papers} contributed papers — the programme "
                    "gives the paper number, presenter surname and title only")

    unnamed_rooms = [f"{b['code']} {r['code']}" for b in doc["venue"]["buildings"]
                     for r in b.get("rooms", []) if not r.get("name")]
    if unnamed_rooms:
        gaps.append("Full room name for " + ", ".join(unnamed_rooms))

    for field, label in [("fees", "Registration fees"), ("deadlines", "Registration deadlines"),
                         ("howTo", "How to register"), ("desk", "On-site registration desk and its hours")]:
        if not doc["registration"].get(field):
            gaps.append(label)
    for field, label in [("meals", "Meals and refreshments"), ("wifi", "Wi-Fi access for delegates"),
                         ("certificates", "How certificates are issued"),
                         ("proceedings", "Proceedings and publication plans"),
                         ("emergency", "Emergency contacts"), ("codeOfConduct", "Code of conduct")]:
        if not doc["logistics"].get(field):
            gaps.append(label)
    if not doc["event"].get("organisers"):
        gaps.append("Organising and technical committee members, and a contact address")
    if not doc["meta"].get("website"):
        gaps.append("The official website or registration page")
    if not doc["meta"].get("theme"):
        gaps.append("The congress theme")
    doc["gaps"] = gaps

    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"\n  Imported into {OUT.relative_to(ROOT)}\n")
    print(f"  Conference   {doc['meta']['name']}")
    print(f"  Dates        {doc['meta']['dates']}")
    print(f"  Tracks       {', '.join(c for c in tracks_seen)}")
    print(f"  Days         {len(days)}")
    print(f"  Papers       {papers}")
    print(f"  Speakers     {len(speakers)}  ({len(stubs)} still placeholders)")
    print(f"  Members      {len(members)} session assignments")
    print(f"  Guidelines   {len(guidelines)} lines")
    if site:
        print(f"  Website      {len(site['committee'])} committee members · "
              f"{len(site['speakers'])} speaker affiliations · {len(site['keyDates'])} key dates")
        print(f"               {amber('sub-conference 27 Sep at DLSU-CSB added (not in the workbook)')}")
    if registration:
        print(f"  Registration {registration['reported'].get('totalRegistrants')} registrants · "
              f"{len(registration['byCountry'])} countries · "
              f"{len(registration['byInstitution'])} institutions")
        print(f"               {amber('per-delegate sheet excluded (names, e-mail, phone, billing)')}")
        if registration.get("caution"):
            print(f"               {amber('totals disagree between sheets — recorded as a caveat')}")
    print(f"  Rooms named  {', '.join(sorted(legend_rooms))}\n")
    if stubs:
        print("  Placeholders still to fill:")
        for s in stubs:
            print("    ·", s)
        print()


if __name__ == "__main__":
    main()
