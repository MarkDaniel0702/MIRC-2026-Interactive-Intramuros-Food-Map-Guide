# Data & method

How the **53 food spots** and **21 heritage sights** on this map were chosen, where the
numbers come from, and what you should and shouldn't trust.

Accommodation is documented separately in [`HOTELS.md`](HOTELS.md); deployment in
[`DEPLOY.md`](DEPLOY.md).

Two of the three **public** hotels from `HOTELS.md` are also shown on the map under the
**Stay** tab (`mapped: true` in `data/hotels.js`) — the third, Residencia 729, is open to
travellers but has no verifiable rate, so it's held back rather than shown with a blank
price (see `HOTELS.md` §"The headline finding"). The members-only and long-stay properties stay
documented but off the map — they are not places a visitor can book, and offering walking
directions to them would be misleading.

### Start points for directions

`data/start-points.js` holds six arrival points offered when asking for directions. Three
of them — Central Terminal (LRT-1), Park & Ride Lawton and Escolta Ferry Station — sit
**outside** the boundary. That is the one sanctioned exception to the inside-only rule:
they are navigation references for people arriving, never listed as destinations, and they
are flagged `outside: true` so the interface labels them as such. Their coordinates come
from Overpass (`railway=station`, `public_transport=station`), not from free-text
geocoding, which during research returned a Rizal Park 19 km away in Las Piñas.

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
- **52** had a `name` tag and were kept. **5** unnamed entries (3 `restaurant`,
  2 `food_court`) were dropped — a map pin with no name is no use to anyone.
- Of those 52, a "bar and nightlife" pass in September 2026 briefly dropped five venues
  wholesale. Four are back after individual review; see §4 for the corrected rule and
  what actually happened to each one.

Every `lat`/`lng` sourced this way in `data/food-spots.js` is copied verbatim from the
Overpass result — none were typed by hand or estimated from an address. The exceptions are
two in-house restaurants at The Bayleaf hotel that have no separate OSM node of their own
(9 Spoons, Raffaele Woodfired Pizza); they share the hotel building's coordinates, which
were independently verified inside the boundary as part of `data/hotels.js`. Both records
say so in their `blurb`.

### Second, independent check

The original 52 Overpass-derived coordinates were reverse-geocoded through Nominatim.
**All 52 came back with `address.quarter = "Intramuros"`** — a separate service, using a
separate lookup path, agreeing with the polygon test. That set includes all five of the
bar-category venues discussed in §4; the two Bayleaf in-house additions postdate that pass
and rely on the hotel-building check described above instead.

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
these 53 establishments; several major Philippine food publications block automated
access, and most independent Intramuros venues publish no menu pricing at all. Printing a
specific range like "₱320–₱480" for a carinderia nobody has priced would present a guess
as a fact. A labelled band is honest about its own precision.

Every card and popup carries the review date and a "confirm with the venue" note.

**Distribution:** 17 × `₱` · 31 × `₱₱` · 4 × `₱₱₱` · 1 × `₱₱₱₱`

---

## 4. Categories

Five categories, each with its own marker colour. There is **no "bar" or "nightlife"
category** — that was tried and reverted; see below. Specific cuisine lives in the
`cuisine` tags (which search covers), not in the category name — so Parers Kimchi is
filed under Restaurants with a `Korean` tag rather than needing a category of its own.

| Key | Label | Count |
|---|---|---|
| `heritage` | Restaurants & Heritage Dining | 18 |
| `cafe` | Cafés & Coffee | 17 |
| `fastfood` | Fast Food & Chains | 7 |
| `budget` | Budget Eats & Carinderias | 7 |
| `dessert` | Desserts & Snacks | 4 |

### The bar/nightlife pass — removed, then corrected

Two edits happened here in quick succession, and the second is the one that stands.

**First**, a "bar and nightlife" category and its five venues — Bamboo Intramuros,
Bataka Bar, Batala Bar, Grotto Hookah Lounge, Sky Deck View Bar — were removed wholesale,
on the reasoning that a university-conference audience doesn't need nightlife listings.

**That was too broad.** Most of those five are dining venues that happen to serve drinks,
not drinking venues that happen to serve food, and the wholesale cut took them out along
with anything genuinely nightlife-only. The corrected rule, applied venue by venue:

> Remove hardcore discos and nightclubs — venues built around dancing, drinking or smoking
> with no real food. Keep restaurants that include a bar as a secondary feature. Do not
> create a bar/nightlife category at all — a kept venue just goes in `heritage` like any
> other restaurant.

Applying that rule to each of the five, independently verified rather than assumed:

| Venue | Verdict | Why |
|---|---|---|
| **Bamboo Intramuros** | Restored | Full name is "Bambu Intramuros Art Bar **and Restaurant**" — Filipino menu (lechon kawali) confirmed independently of OSM. |
| **Bataka Bar** | Restored | Independently confirmed as "one of the dining establishments" inside the Plaza San Luis heritage complex. |
| **Batala Bar** | Restored | Full sit-down menu confirmed — appetizers, mains, pasta, seafood, vegan options, a ₱440 crispy pork bagnet — plus its own ice cream and coffee. Clearly a restaurant, not a bar. |
| **Sky Deck View Bar** | Restored | Confirmed via The Bayleaf's own restaurants page: "cocktails and bar snacks" — food is stated, even if minor. See the Bayleaf addition below. |
| **Grotto Hookah Lounge** | **Stays out** | A shisha lounge with no food offering found anywhere. This is the "hardcore bar" case the corrected rule is written to exclude — smoking and drinks, no dining. |

Four of five came back. The one that didn't is excluded on the same evidence standard as
everything else on this map — verified, not assumed — rather than by category.

One knock-on note: "Batala" (ice cream) and "Batala Bar" are two different venues roughly
250 m apart, distinguished only by that one word. Both are back on the map — see the name
carefully.

### The Bayleaf's other restaurants

While re-checking Sky Deck View Bar against The Bayleaf's own restaurants page
(`thebayleaf.com.ph/intramuros/restaurants/`), three more of the hotel's dining venues
came to light and are now on the map alongside Cioccolata, which was already listed:

- **9 Spoons** — the hotel's all-day dining restaurant, 9th floor. Filipino heritage
  dishes (kare-kare, bagnet, sizzling bulalo), a weekday lunch buffet at ≈₱780, and the
  hotel's breakfast service. Dish prices ₱500–₱1,000 → tier `₱₱₱`.
- **Raffaele Woodfired Pizza** — 3rd floor, wood-fired pizza, ₱200–₱900 per pie →
  tier `₱₱` for a typical single order.
- **Sky Deck View Bar** — see above.

Neither 9 Spoons nor Raffaele has its own OSM node — Overpass has no record of them as
separate points, only the hotel building itself. Both records use the hotel's own
coordinates (already verified inside the boundary) and say so plainly in their `blurb`.
Their `osm` field is suffixed `(9F)` / `(3F)` rather than left identical, so the schema's
duplicate-reference check still catches a real accidental duplicate if one is ever
introduced — it isn't disabled, just correctly not tripped by an intentional case.

The source page listed no pricing for any of its four venues; Raffaele's and 9 Spoons'
figures above came from a separate search of menu and review sources, cited in each
record's data.

### Editorial decisions worth knowing

- **Three Starbucks branches** exist inside the boundary. They're disambiguated by
  location (General Luna South / General Luna North / Muralla) rather than listed as three
  identical rows.
- **Coffee and tea chains** (Starbucks, Figaro, Moonleaf) are filed under *Cafés & Coffee*,
  not *Fast Food & Chains* — someone filtering for coffee wants to see them.
- **Street names** come from the OSM `addr:street` tag where present, otherwise from the
  reverse-geocoded nearest road. Where a spot has neither, the `area` field is shown instead.

---

## 5. Tourist spots (the "See" tab)

Added September 2026 for the conference audience: visiting researchers with a few free
hours between sessions. Machine data in `data/tourist-spots.js`.

**Collection.** Same discipline — an Overpass query constrained to the boundary:

```overpassql
[out:json][timeout:120];
area(3600103707)->.a;
(
  nwr["tourism"~"^(attraction|museum|gallery|artwork|viewpoint|theme_park)$"](area.a);
  nwr["historic"~"^(castle|fort|monument|memorial|ruins|city_gate|building|church|archaeological_site)$"](area.a);
  nwr["amenity"~"^(place_of_worship|theatre|arts_centre)$"](area.a);
  nwr["leisure"="park"](area.a);
);
out center tags;
```

That returned **98 uniquely named features**, most of them small statues and plaques. The
list was curated down to **21** that justify a visit, keeping the OSM coordinate for each.
Every one passes the same point-in-polygon gate.

| Key | Label | Count |
|---|---|---|
| `museum` | Museums | 5 |
| `church` | Churches | 2 |
| `fort` | Walls, Gates & Bastions | 7 |
| `plaza` | Plazas & Gardens | 4 |
| `monument` | Monuments & Ruins | 3 |

### Entrance fees — better sourced than the food prices

Unlike restaurant prices, these are **published and stable**. They come from the
Intramuros Administration ([intramuros.gov.ph](https://intramuros.gov.ph/guide-museums/))
and the individual operators, checked **2026-09-03**:

| Site | Regular | Discounted |
|---|---|---|
| Fort Santiago | ₱75 | ₱50 |
| Casa Manila | ₱75 | ₱50 |
| Baluarte de San Diego | ₱75 | ₱50 |
| Bahay Tsinoy | ₱100 | ₱60 (students) |
| Museo de Intramuros | ₱200 | ₱160 |
| San Agustin Museum | ₱200 | ₱160 |
| Everything else listed | Free | — |

Discounted rates apply to students, seniors and PWD — most conference delegates with a
university ID qualify.

**Intramuros Passport — ₱350** covers Fort Santiago, Casa Manila, Museo de Intramuros,
Baluarte de San Diego and Centro de Turismo, plus a free guided tranvía tour. It pays for
itself from the third paid site onward, which is why the sights tab surfaces it in the
footer. *Centro de Turismo is the one passport site not pinned on the map — its
coordinates could not be verified, and nothing unverified gets a pin.*

### Visit durations and walking times

- `duration` is an estimate for an unhurried visit, not a rushed one. It is editorial —
  no source publishes these.
- Walking time is the straight-line distance from `VENUE_ANCHOR` at
  `WALK_METRES_PER_MIN` (80 m/min). Straight-line under-reads real walking by roughly
  10–20% in a grid, so treat it as a floor.

> **Set the anchor to your venue.** `VENUE_ANCHOR` in `data/tourist-spots.js` defaults to
> Plaza de Roma. Change its `name`, `lat` and `lng` to the conference venue and every
> walking time on the site re-bases itself. That is the single highest-value edit for
> this audience.

### Accuracy notes

- Opening hours change, especially around holidays and for Mass at the churches. San
  Agustin and Manila Cathedral close to sightseers during services and weddings.
- Most museums **close on Monday**. Bahay Tsinoy opens only 1–5pm.
- The `fort-santiago` pin marks the **main gate**, where tickets are sold, rather than the
  centre of the complex — more useful for actually getting there.

---

## 6. Known limitations

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

## 7. Refreshing the data

1. Re-run the Overpass query in §2 (food) or §5 (sights).
2. Update `data/food-spots.js` / `data/tourist-spots.js`, keeping each record's curated
   fields (`category`, `priceTier` / `feeTier`, `cuisine`, `duration`, `blurb`).
3. Bump `DATA_REVIEWED` / `SIGHTS_REVIEWED` in the file you touched.
4. Run the gate — it must pass before shipping. It checks food, sights and hotels:

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
