# Accommodation inside Intramuros

Compiled 2026-09-03. Machine data in [`data/hotels.js`](data/hotels.js); every coordinate
is gated by `node tools/verify-in-intramuros.mjs` against the official Intramuros
administrative boundary (OSM relation `103707`) — the same polygon the food map uses.

---

## The headline finding

**Only three properties inside the walls are open to travellers.**

Booking aggregators advertise "201 hotels in Intramuros" and similar. They are counting a
radius, not the district — those lists are dominated by Ermita, Malate, Binondo and Rizal
Park properties. Applying the same boundary test used for the food spots, an Overpass
query constrained to relation `103707` returns **8 accommodation POIs**, of which:

| | Count | |
|---|---|---|
| Open to travellers | **3** | The Bayleaf, White Knight, Residencia 729 |
| Members only | 3 | AMOSUP seafarers' union facilities |
| Student / long-stay | 2 | Dormitory and boarding house |

The commonly cited "only hotel in Intramuros" claim for The Bayleaf is close but not
exact — it is the only *full-service* hotel; White Knight is a genuine second option.

---

## ⚠️ Read before quoting any rate

**These are indicative ranges gathered on 2026-09-03, not live rates.** Nightly hotel
pricing is dynamic — it moves with season, day of week, lead time and channel, and it will
not match what you see at booking time. The request asked for prices "sourced/verified as
current"; the honest position is that I can source them and date them, but nobody can
verify a nightly rate that changes daily. Confirm directly before relying on a number.

USD-sourced figures are converted at **₱62.50 / US$1** (rate as of 2026-09-02).

---

## 1. Open to travellers

### The Bayleaf Intramuros

| Field | Detail |
|---|---|
| **Location** | Muralla corner Victoria Street, Intramuros, 1002 Manila — eastern wall, beside Lyceum of the Philippines University |
| **Coordinates** | 14.590004, 120.978725 · verified inside boundary |
| **Price range** | **≈ ₱2,800 – ₱13,300 per night.** From about ₱2,765 for a Superior; typical standard room ₱4,000 – ₱9,100; Bayleaf Suite reaches roughly ₱13,000 |
| **Room types** | 57 rooms in 7 categories — Superior Twin (23 sqm) · Deluxe Twin / Queen / King (25 sqm) · Premier Trio (31 sqm) · Executive Suite (45 sqm) · Bayleaf Suite (135 sqm) |
| **Booking / contact** | [thebayleaf.com.ph/intramuros](https://www.thebayleaf.com.ph/intramuros/) · +63 2 5318 5000 / 5328 3170 · tbi-inquiry@thebayleaf.com.ph |
| **Notes** | Operated by Lyceum of the Philippines University. Houses the Sky Deck rooftop bar, 9 Spoons and Cioccolata — three venues that also appear on the food map. |
| **Price sourced from** | Hotel's own reservation page ("rates from ₱2,765"); aggregator listings US$46–US$213 |

### White Knight Hotel Intramuros

| Field | Detail |
|---|---|
| **Location** | Plaza San Luis Complex, General Luna Street, Intramuros, 1002 Manila — opposite San Agustin Church (mapped at Urdaneta Street) |
| **Coordinates** | 14.589591, 120.975686 · verified inside boundary |
| **Price range** | **≈ ₱1,750 – ₱5,100 per night.** Typically around ₱2,000; standard rooms roughly ₱1,900 – ₱2,500 |
| **Room types** | 29 air-conditioned rooms — Standard, Queen, Double, plus family/group rooms. All with safe, coffee/tea maker, LCD cable TV, private hot/cold bath |
| **Booking / contact** | No official site found; listed on major OTAs (Agoda, Booking, Traveloka, KAYAK) and [Facebook](https://www.facebook.com/whiteknighthotelintramuros/) |
| **Notes** | A restored Spanish colonial mansion — whitewashed walls, tile floors, wooden staircases — inside the Plaza San Luis complex, so it sits directly among the heritage food spots (Barbara's, Batala Bar, Café Intramuros, Tesoros). In-house café; massage and airport/city transfers offered. |
| **Price sourced from** | Aggregator listings US$28–US$82, average US$32 |

### Residencia 729

| Field | Detail |
|---|---|
| **Location** | Santa Potenciana Street, Intramuros — southern quarter, near Cabildo Street |
| **Coordinates** | 14.589739, 120.976733 · verified inside boundary |
| **Price range** | **Not published.** No current nightly rate is verifiable from any public source |
| **Room types** | Not published |
| **Booking / contact** | None found |
| **Notes** | Tagged `tourism=hotel` in OpenStreetMap and genuinely inside the walls, but it has no booking presence. A 2009 dormitory directory lists it at ₱3,000 **per month**, which suggests long-stay rather than nightly letting. Included for completeness — **contact directly before relying on it**, and do not quote a nightly rate for it. |

---

## 2. Members only — not available to travellers

These are real, sizeable accommodation inside the walls, but they are not bookable. They
are listed so the picture of what is actually inside Intramuros is complete.

| Property | Location | Basis | Contact |
|---|---|---|---|
| **Sailor's Home (AMOSUP)** | 3 Cabildo Street | **Free** to AMOSUP members in good standing. 1,024 beds (932 male / 92 female) in air-conditioned dormitory rooms; mess hall, gym, library, free breakfast. Running since 1978 for transient union members waiting to board or heading home. | [amosup.org](https://amosup.org/union-programs/sailors-home/) · +63 2 8527 8491 |
| **Amosup Sailors Home (annex)** | Near Cabildo Street, same complex | Second mapped point in the AMOSUP complex; same members-only basis | as above |
| **Sailors Inn** | Western Intramuros, near Santa Clara Street | Seafarer-oriented guest house. No public booking presence found — assume not open to general travellers without confirming | none found |

---

## 3. Student / long-stay housing

Intramuros holds a dense university cluster (Lyceum of the Philippines, Mapúa, Pamantasan
ng Lungsod ng Maynila, Colegio de San Juan de Letran), and the accommodation reflects that.
These let by the month, not the night.

| Property | Location | Notes |
|---|---|---|
| **Magallanes Dormitory** | Magallanes Drive, south-eastern quarter | Student housing beside the campuses. Rates not published |
| **608 Boarding House** | Cabildo Street, southern quarter | Small boarding house, generally let monthly |

---

## 4. Reported but unverified

**Intramuros Stay by IN CAFE** — marketed as "at the heart of Intramuros"; a 1-bedroom unit
with a cinema area across 4 floors, open since June 2024. Listed at about **₱3,387/night**
for the Cinema Room, averaging around ₱2,700 (Klook; US$43 at ₱62.5).

It is **excluded from the verified data** because no street address is published and it
does not resolve in Nominatim — so its position could not be tested against the boundary.
It may well be inside; it has not been shown to be. Recorded in
`HOTELS_UNVERIFIED` in `data/hotels.js` rather than mixed in with the confirmed entries.

---

## Method & limitations

**Collection.** Overpass query constrained to `area(3600103707)`:

```overpassql
[out:json][timeout:90];
area(3600103707)->.a;
(
  nwr["tourism"~"^(hotel|hostel|guest_house|motel|apartment|chalet)$"](area.a);
  nwr["building"="hotel"](area.a);
);
out center tags;
```

Returned 8 named POIs, all retained. Access type, room detail and pricing were then
researched per property from official sites, OTA listings and operator pages.

**Limitations worth stating plainly:**

- **Rates are a dated snapshot, not live pricing.** See the warning above.
- **Two of the three public properties have thin data.** Only The Bayleaf publishes room
  categories and an official rate floor. White Knight's range is reconstructed from
  aggregator listings; Residencia 729 has no usable pricing at all.
- **OSM coverage of accommodation is thinner than for food.** Small guesthouses and
  short-let apartments — particularly ones that exist only on Airbnb or Klook — will not
  appear in an Overpass query. "Intramuros Stay by IN CAFE" is the concrete example.
- **The administrative district is slightly larger than the stone walls**, the same caveat
  that applies to the food map.

**Attribution.** Property names and coordinates © [OpenStreetMap](https://www.openstreetmap.org/copyright)
contributors (ODbL). Rate and room information from the operators' own sites and public
listings, cited per record in `data/hotels.js`.
