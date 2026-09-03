/**
 * Accuracy gate for the Intramuros Food Map.
 *
 *   node tools/verify-in-intramuros.mjs
 *
 * The brief for this project has one hard requirement: every listed food spot must
 * be physically inside Intramuros, and nothing from Binondo, Ermita, Malate, Quiapo
 * or anywhere else may appear. This script is how that requirement is *enforced*
 * rather than asserted.
 *
 * It runs two passes over data/food-spots.js:
 *
 *   1. LOCATION  — ray-casting point-in-polygon test of every coordinate against the
 *                  official Intramuros administrative boundary (OSM relation 103707,
 *                  in data/intramuros-boundary.js). Any spot outside fails the build.
 *   2. SCHEMA    — required fields present, priceTier in 1..4, known category,
 *                  unique ids, unique OSM references, coordinates in a sane range.
 *
 * Exit code 0 = everything passed. Exit code 1 = at least one failure.
 * Re-run this after any edit to data/food-spots.js.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const { FOOD_SPOTS, PRICE_TIERS, CATEGORIES, DATA_REVIEWED } = require(join(root, 'data', 'food-spots.js'));
const { INTRAMUROS_BOUNDARY } = require(join(root, 'data', 'intramuros-boundary.js'));

/* ── terminal colours (skipped when output is piped or NO_COLOR is set) ───────── */
const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (tty ? `[${code}m${s}[0m` : s);
const green = s => c('32', s);
const red = s => c('31', s);
const dim = s => c('2', s);
const bold = s => c('1', s);

/**
 * Standard ray-casting point-in-polygon.
 * `ring` is a GeoJSON linear ring: an array of [lng, lat] pairs.
 */
function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const straddles = (yi > lat) !== (yj > lat);
    if (straddles && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** True when the point is inside the outer ring and not inside any hole. */
function insideBoundary(lng, lat, geometry) {
  const polygons = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
  return polygons.some(([outer, ...holes]) =>
    pointInRing(lng, lat, outer) && !holes.some(hole => pointInRing(lng, lat, hole))
  );
}

/* ── pass 1: location ────────────────────────────────────────────────────────── */

const failures = [];
const outside = [];

console.log(bold('\n  Intramuros Food Map — data verification'));
console.log(dim(`  boundary: ${INTRAMUROS_BOUNDARY.properties.osm}  ·  spots: ${FOOD_SPOTS.length}  ·  reviewed: ${DATA_REVIEWED}\n`));
console.log(bold('  1. Location — is every spot inside Intramuros?\n'));

for (const spot of FOOD_SPOTS) {
  const ok = insideBoundary(spot.lng, spot.lat, INTRAMUROS_BOUNDARY.geometry);
  if (!ok) outside.push(spot);
  const mark = ok ? green('PASS') : red('FAIL');
  console.log(`     ${mark}  ${spot.name.padEnd(34)} ${dim(`${spot.lat}, ${spot.lng}`)}`);
}

console.log(
  outside.length === 0
    ? green(`\n     All ${FOOD_SPOTS.length} spots are inside the official Intramuros boundary.\n`)
    : red(`\n     ${outside.length} spot(s) fall OUTSIDE Intramuros and must be removed.\n`)
);
if (outside.length) failures.push(`${outside.length} spot(s) outside the boundary`);

/* ── pass 2: schema ──────────────────────────────────────────────────────────── */

console.log(bold('  2. Schema — is every record well formed?\n'));

const required = ['id', 'name', 'category', 'priceTier', 'cuisine', 'lat', 'lng', 'osm', 'blurb'];
const problems = [];
const seenIds = new Map();
const seenOsm = new Map();

for (const spot of FOOD_SPOTS) {
  const where = spot.id || spot.name || '(unnamed record)';

  for (const field of required) {
    if (spot[field] === undefined || spot[field] === null || spot[field] === '') {
      problems.push(`${where}: missing required field "${field}"`);
    }
  }
  if (!Number.isInteger(spot.priceTier) || !PRICE_TIERS[spot.priceTier]) {
    problems.push(`${where}: priceTier ${JSON.stringify(spot.priceTier)} is not one of 1-4`);
  }
  if (!CATEGORIES[spot.category]) {
    problems.push(`${where}: unknown category "${spot.category}"`);
  }
  if (!Array.isArray(spot.cuisine) || spot.cuisine.length === 0) {
    problems.push(`${where}: cuisine must be a non-empty array`);
  }
  if (!(spot.lat > 14.58 && spot.lat < 14.60 && spot.lng > 120.96 && spot.lng < 120.99)) {
    problems.push(`${where}: coordinates are outside the Intramuros bounding box`);
  }
  if (seenIds.has(spot.id)) problems.push(`duplicate id "${spot.id}" (also used by ${seenIds.get(spot.id)})`);
  else seenIds.set(spot.id, spot.name);

  if (seenOsm.has(spot.osm)) problems.push(`duplicate OSM ref "${spot.osm}" (${spot.name} / ${seenOsm.get(spot.osm)})`);
  else seenOsm.set(spot.osm, spot.name);
}

if (problems.length === 0) {
  console.log(green(`     All ${FOOD_SPOTS.length} records are well formed.\n`));
} else {
  for (const p of problems) console.log(`     ${red('FAIL')}  ${p}`);
  console.log('');
  failures.push(`${problems.length} schema problem(s)`);
}

/* ── summary ─────────────────────────────────────────────────────────────────── */

const byCategory = {};
const byTier = {};
for (const s of FOOD_SPOTS) {
  byCategory[s.category] = (byCategory[s.category] || 0) + 1;
  byTier[s.priceTier] = (byTier[s.priceTier] || 0) + 1;
}

console.log(bold('  Breakdown\n'));
for (const [key, meta] of Object.entries(CATEGORIES)) {
  console.log(`     ${String(byCategory[key] || 0).padStart(3)}  ${meta.label}`);
}
console.log('');
for (const [tier, meta] of Object.entries(PRICE_TIERS)) {
  console.log(`     ${String(byTier[tier] || 0).padStart(3)}  ${meta.symbol.padEnd(6)} ${meta.label.padEnd(13)} ${dim(meta.range)}`);
}

if (failures.length === 0) {
  console.log(green(bold('\n  VERIFIED — every spot is inside Intramuros and every record is valid.\n')));
  process.exit(0);
} else {
  console.log(red(bold(`\n  FAILED — ${failures.join('; ')}.\n`)));
  process.exit(1);
}
