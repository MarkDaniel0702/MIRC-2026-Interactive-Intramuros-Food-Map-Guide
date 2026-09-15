/**
 * Marker glyphs and popup icons. These feed Leaflet divIcon `html:` strings and
 * popup HTML strings (see hooks/useLeafletMap.ts) -- they stay string builders,
 * not JSX, because Leaflet owns that DOM, not React. Ported verbatim from
 * app.js:60-89.
 */

export const GLYPHS: Record<string, string> = {
  fork: 'M5.4 2.4v3.6a1.5 1.5 0 0 0 3 0V2.4M6.9 7.4v6.2M11.4 2.4c1.1 1.5 1.1 3.7 0 4.9v6.3',
  cup: 'M3.6 5.8h7.6v3.2a3.4 3.4 0 0 1-3.4 3.4h-.8a3.4 3.4 0 0 1-3.4-3.4zM11.2 6.8h1a1.5 1.5 0 0 1 0 3h-1',
  burger: 'M3.2 6.6c0-1.9 2.1-3.4 4.8-3.4s4.8 1.5 4.8 3.4zM3.2 8.8h9.6M3.7 10.9h8.6a2 2 0 0 1-2 2H5.7a2 2 0 0 1-2-2z',
  bowl: 'M2.6 7.6h10.8a5.4 5.4 0 0 1-10.8 0zM6.1 5.4c.5-.9 1.2-1.5 1.9-1.9.7.4 1.4 1 1.9 1.9',
  cone: 'M5.1 6.8h5.8L8 13.4zM5.3 6.8a2.7 2.7 0 0 1 5.4 0',
  // sights
  museum: 'M2.4 13.4h11.2M3.7 13.4V7M6.5 13.4V7M9.5 13.4V7M12.3 13.4V7M2.4 6.4 8 3l5.6 3.4z',
  church: 'M8 1.8v2.9M6.8 3.2h2.4M8 4.7 4.2 7.9v5.5h7.6V7.9zM6.9 13.4v-2.2a1.1 1.1 0 0 1 2.2 0v2.2',
  gate: 'M2.6 13.4V6.4L8 3.1l5.4 3.3v7M5.9 13.4V9.6a2.1 2.1 0 0 1 4.2 0v3.8M2.6 6.6h10.8',
  tree: 'M8 13.5v-3.1M4.7 9.6h6.6L8 3.3zM5.8 7h4.4M5.6 13.5h4.8',
  obelisk: 'M4.9 13.5h6.2M6.7 13.5 7.1 5.7h1.8l.4 7.8M7.1 5.7 8 2.5l.9 3.2',
  // stay
  bed: 'M2.2 12.8V4.4M2.2 8.2h11.6a2 2 0 0 1 2 2v2.6M2.2 11h13.6M5.4 6.9a1.3 1.3 0 1 0 0-.1z'
};

export const PIN_SVG = (key: string) =>
  `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${GLYPHS[key]}"/></svg>`;

export const MARKER_SVG =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14.5S13 10 13 6.4a5 5 0 0 0-10 0C3 10 8 14.5 8 14.5z"/><circle cx="8" cy="6.3" r="1.7"/></svg>';

export const CLOCK_SVG =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M8 4.6V8l2.4 1.6"/></svg>';

export const ROUTE_SVG =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M14.2 1.8 2 6.9l5.3 1.8L9.1 14z"/></svg>';

export const ARROWS: Record<string, string> = {
  left: 'M13 13.2V8.4a3 3 0 0 0-3-3H3.4M6.2 2.4 3 5.4l3.2 3',
  right: 'M3 13.2V8.4a3 3 0 0 1 3-3h6.6M9.8 2.4 13 5.4l-3.2 3',
  straight: 'M8 13.4V3.2M4.5 6.7 8 3.2l3.5 3.5',
  start: 'M8 13.6a5.6 5.6 0 1 1 0-11.2 5.6 5.6 0 0 1 0 11.2zM8 9.7a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4z',
  flag: 'M4 14.2V2.2M4 3.1h8.6l-1.9 2.9 1.9 2.9H4'
};

export const ARROW_SVG = (k: string) =>
  `<svg class="dirs__arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="${ARROWS[k] || ARROWS.straight}"/></svg>`;
