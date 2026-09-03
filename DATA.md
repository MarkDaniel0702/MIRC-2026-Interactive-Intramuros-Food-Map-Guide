# Data & method

How the 52 food spots on this map were chosen, where the numbers come from, and what
you should and shouldn't trust.

---

## 1. What counts as "inside Intramuros"

The brief's hard requirement is that only establishments physically inside Intramuros
appear — nothing from Binondo, Ermita, Malate, Quiapo or anywhere else. To make that
checkable rather than a matter of judgement, the map uses one authoritative shape:

> **OpenStreetMap relation [103707](https://www.openstreetmap.org/relation/103707)** —
> `boundary=administrative`, the Intramuros quarter of the Fifth District of Manila.

Retrieved from Nominatim on **2026-09-03** as a 61-point GeoJSON polygon and stored at
`data/intramuros-boundary.js`. Its bounding box is
lat `14.5828894 – 14.5960191`, lon `120.9673210 – 120.9810822`.

That single polygon is used three times over, which is why it is trustworthy:

| Where | What it does |
|---|---|
| `app.js` | Drawn as the lit ground; everything outside is dimmed by an inverse mask |
| `app.js` | Sets the map's `maxBounds`, so the view stays on Intramuros |
| `tools/verify-in-intramuros.mjs` | Ray-casting point-in-polygon gate on every listed spot |

> **Note on the walls.** The administrative district is slightly larger than the stone
> walls themselves — it includes the Club Intramuros golf course, laid out in the old
> moat just outside the ramparts. That venue is inside the official Intramuros boundary
> and is labelled as such on its card, rather than being silently dropped or silently
> passed off as being within the walls.

---

## 2. How the spots were collected

The list was **not** assembled by hand from blog round-ups and then spot-checked. It was
queried directly from inside the boundary, so every result is in Intramuros by construction.

Overpass API query (area `3600103707` = relation `103707` + the 3600000000 offset):

```overpassql
[out:json][timeout:90];
area(3600103707)->.a;
(
  nwr["amenity"~"^(restaurant|cafe|fast_food|bar|pub|ice_cream|food_court)$"](area.a);
  nwr["shop"~"^(bakery|coffee|pastry|confectionery|deli)$"](area.a);
);
out center tags;
```

Run against `https://overpass-api.de/api/interpreter` (or the
`https://overpass.kumi.systems/api/interpreter` mirror) on **2026-09-03**.

- Returned **57** food and drink POIs.
- **52** had a `name` tag and were kept.
- **5** unnamed entries (3 `restaurant`, 2 `food_court`) were dropped — a map pin with no
  name is no use to anyone.

Every `lat`/`lng` in `data/food-spots.js` is copied verbatim from that result. None were
typed by hand or estimated from an address.

### Second, independent check

All 52 coordinates were then reverse-geocoded through Nominatim. **All 52 came back with
`address.quarter = "Intramuros"`** — a separate service, using a separate lookup path,
agreeing with the polygon test.

---

## 3. Price ranges — read this before trusting a number

**Price tiers on this map are indicative estimates, not quoted prices.**

One scale is used across every listing, in the filters, the list cards, the popups and
the legend:

| Tier | Label | Band, per person |
|------|-------|------------------|
| `₱` | Budget | under ₱200 |
| `₱₱` | Moderate | ₱200 – ₱500 |
| `₱₱₱` | Upscale | ₱500 – ₱1,000 |
| `₱₱₱₱` | Fine dining | ₱1,000 and up |

Tiers were assigned from three sources, in order of preference:

1. **Published prices**, where they exist. Barbara's Casa Manila advertises a ₱1,200 lunch
   / ₱1,500 dinner buffet (→ `₱₱₱₱`); Patio de Conchita is widely reported at about ₱140
   for a complete rice meal (→ `₱`).
2. **Standard national chain pricing** for the chains — Jollibee, McDonald's, KFC,
   Chowking and Greenwich all sit in `₱`; Max's and Bacolod Chk-N-Bbq in `₱₱`.
3. **Establishment type** for the rest: carinderia / turo-turo / food house → `₱`;
   specialty café → `₱₱`; hotel restaurant and rooftop bar → `₱₱₱`.

### Why not exact peso figures per venue?

Because they aren't available. Published prices could be verified for only a handful of
these 52 establishments; several major Philippine food publications block automated
access, and most independent Intramuros venues publish no menu pricing at all. Printing a
specific range like "₱320–₱480" for a carinderia nobody has priced would present a guess
as a fact. A labelled band is honest about its own precision.

Every card and popup carries the review date and a "confirm with the venue" note.

**Distribution:** 17 × `₱` · 31 × `₱₱` · 3 × `₱₱₱` · 1 × `₱₱₱₱`

---

## 4. Categories

Six categories, each with its own marker colour. Specific cuisine lives in the `cuisine`
tags (which search covers), not in the category name — so Parers Kimchi is filed under
Restaurants with a `Korean` tag rather than needing a category of its own.

| Key | Label | Count |
|---|---|---|
| `heritage` | Restaurants & Heritage Dining | 12 |
| `cafe` | Cafés & Coffee | 17 |
| `bar` | Bars & Nightlife | 5 |
| `fastfood` | Fast Food & Chains | 7 |
| `budget` | Budget Eats & Carinderias | 7 |
| `dessert` | Desserts & Snacks | 4 |

### Editorial decisions worth knowing

- **Three Starbucks branches** exist inside the boundary. They're disambiguated by
  location (General Luna South / General Luna North / Muralla) rather than listed as three
  identical rows.
- **"Batala" and "Batala Bar" are two different venues** ~250 m apart — an ice cream
  counter on San Jose Street and a craft beer bar in Plaza San Luis. Both are kept, and
  the ice cream one is named "Batala (Ice Cream)" so the list isn't confusing.
- **Coffee and tea chains** (Starbucks, Figaro, Moonleaf) are filed under *Cafés & Coffee*,
  not *Fast Food & Chains* — someone filtering for coffee wants to see them.
- **Street names** come from the OSM `addr:street` tag where present, otherwise from the
  reverse-geocoded nearest road. Where a spot has neither, the `area` field is shown instead.

---

## 5. Known limitations

- **OSM POIs can be stale.** A few entries have low OSM node ids, meaning they were mapped
  many years ago; venues in Intramuros open and close. `Ilustrado` (node 735198925) is the
  clearest example — it is a long-standing listing whose current operating status was not
  independently confirmed.
- **Coverage is as good as OpenStreetMap's.** Small carinderias and stalls that nobody has
  mapped won't appear. A handful of known venues — for instance the in-house restaurants at
  The Bayleaf — are absent from OSM; none were added by hand for this build, so every
  coordinate here traces back to a single verifiable source.
- **Prices drift.** The tier bands are a snapshot reviewed 2026-09-03.

---

## 6. Refreshing the data

1. Re-run the Overpass query in §2.
2. Update `data/food-spots.js`, keeping each record's curated fields
   (`category`, `priceTier`, `cuisine`, `blurb`).
3. Bump `DATA_REVIEWED` in `data/food-spots.js`.
4. Run the gate — it must pass before shipping:

```bash
node tools/verify-in-intramuros.mjs
```

If the boundary itself needs refreshing:

```bash
curl "https://nominatim.openstreetmap.org/search?q=Intramuros,+Manila&format=geojson&polygon_geojson=1&limit=1" \
  -H "User-Agent: your-app/1.0"
```

---

## Licence & attribution

Place names, coordinates and the boundary polygon are from **OpenStreetMap**,
© OpenStreetMap contributors, licensed under the
[Open Database Licence (ODbL)](https://www.openstreetmap.org/copyright).
Base map tiles are served by the OpenStreetMap Foundation's standard tile layer.

Categories, price tiers and descriptions are editorial additions made for this project.
