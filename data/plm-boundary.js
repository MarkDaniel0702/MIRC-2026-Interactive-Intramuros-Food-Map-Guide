/**
 * Campus footprint of PLM (Pamantasan ng Lungsod ng Maynila), the university
 * inside Intramuros -- the same kind of source INTRAMUROS_BOUNDARY is, one
 * level down.
 *
 * Source: OpenStreetMap way/27275574 (amenity=university), retrieved via the
 * OSM API on 2026-09-23. Licensed ODbL — (c) OpenStreetMap contributors.
 *
 * This polygon is the single source of truth for what counts as "on campus"
 * for the PLM Map (the collapsed, primary map view). It is used to:
 *   1. useLeafletMap.ts — draw the same shade-outside/tint-inside/dashed-gold-
 *      line boundary treatment INTRAMUROS_BOUNDARY gets, around the campus
 *      instead of the walls, while the PLM Map is showing.
 *   2. useLeafletMap.ts — set the map's maxBounds while collapsed, so panning
 *      is a hard geographic restriction, not just a zoom limit.
 *
 * Coordinates are [longitude, latitude] per the GeoJSON spec, same as
 * intramuros-boundary.js. All five campus landmarks in data/landmarks.js
 * (the 'plm' pin and its four buildings) fall inside this ring.
 */

/** @type {import('./types').BoundaryFeature} */
export const PLM_BOUNDARY = {
  "type": "Feature",
  "properties": {
    "name": "Pamantasan ng Lungsod ng Maynila",
    "osm": "way/27275574"
  },
  "geometry": {
    "type": "Polygon",
    "coordinates": [
      [
        [
          120.9761722,
          14.5858654
        ],
        [
          120.9762291,
          14.5858687
        ],
        [
          120.9765957,
          14.5860565
        ],
        [
          120.9771694,
          14.5863476
        ],
        [
          120.9773302,
          14.5864327
        ],
        [
          120.9773353,
          14.5864755
        ],
        [
          120.9773548,
          14.5864855
        ],
        [
          120.9773784,
          14.5864961
        ],
        [
          120.9773888,
          14.5865012
        ],
        [
          120.9775183,
          14.5865685
        ],
        [
          120.9775261,
          14.5866028
        ],
        [
          120.9774259,
          14.5867303
        ],
        [
          120.977398,
          14.5867643
        ],
        [
          120.9773838,
          14.5867817
        ],
        [
          120.977382,
          14.5868113
        ],
        [
          120.9772171,
          14.5870083
        ],
        [
          120.976502,
          14.5878554
        ],
        [
          120.9753518,
          14.5870313
        ],
        [
          120.9753495,
          14.5869759
        ],
        [
          120.9761722,
          14.5858654
        ]
      ]
    ]
  }
};
