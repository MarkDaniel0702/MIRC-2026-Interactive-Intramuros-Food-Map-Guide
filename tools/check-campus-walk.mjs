/**
 * Checks src/lib/routing.ts's campusWalk: from the inside end of the PLM gate to every
 * campus destination, the walk starts and ends on the right points, stays on the mapped
 * campus ways in between (data/plm-paths.js), and only its first and last legs -- onto
 * and off the nearest way -- are straight lines of more than a few metres.
 *
 *   node tools/check-campus-walk.mjs
 */
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { campusWalk } = await vite.ssrLoadModule('/src/lib/routing.ts');
  const { PLM_PATHS } = await vite.ssrLoadModule('/data/plm-paths.js');
  const { LANDMARKS } = await vite.ssrLoadModule('/data/landmarks.js');
  const { FOOD_SPOTS } = await vite.ssrLoadModule('/data/food-spots.js');

  const GATE_INSIDE = [14.586677, 120.977195];
  const onWay = new Set(PLM_PATHS.flat().map(p => p.join()));
  const m = (a, b) => Math.hypot((a[0] - b[0]) * 110574, (a[1] - b[1]) * 111320 * Math.cos((a[0] * Math.PI) / 180));
  const length = line => line.slice(1).reduce((s, p, i) => s + m(line[i], p), 0);
  // metres from p to the nearest campus way segment
  const k = Math.cos((14.5868 * Math.PI) / 180);
  const toWays = p => Math.min(...PLM_PATHS.flatMap(way => way.slice(1).map((b, i) => {
    const a = way[i], dx = (b[1] - a[1]) * k, dy = b[0] - a[0];
    const t = Math.max(0, Math.min(1, ((p[1] - a[1]) * k * dx + (p[0] - a[0]) * dy) / (dx * dx + dy * dy || 1)));
    return m(p, [a[0] + t * dy, a[1] + (t * dx) / k]);
  })));

  const dests = [...LANDMARKS.filter(l => l.id === 'plm' || l.campus), FOOD_SPOTS.find(s => s.id === 'plm-canteen')];
  assert.equal(dests.length, 15);
  for (const d of dests) {
    const walk = campusWalk(GATE_INSIDE, [d.lat, d.lng]);
    assert.deepEqual(walk[0], GATE_INSIDE, d.id);
    assert.deepEqual(walk.at(-1), [d.lat, d.lng], d.id);
    // walk = [from, snap, ...way points, snap, to]
    for (const p of walk.slice(2, -2)) assert.ok(onWay.has(p.join()), `${d.id}: ${p} is not on a campus way`);
    // between the two straight legs, every segment runs along a way (its midpoint is on one)
    for (let i = 1; i < walk.length - 2; i++) {
      const mid = [(walk[i][0] + walk[i + 1][0]) / 2, (walk[i][1] + walk[i + 1][1]) / 2];
      assert.ok(toWays(mid) < 0.5, `${d.id}: segment ${i} cuts across, ${toWays(mid).toFixed(1)} m off the ways`);
    }
    assert.ok(m(walk[0], walk[1]) < 2, `${d.id}: gate is ${m(walk[0], walk[1]).toFixed(1)} m off the ways`);
    assert.ok(m(walk.at(-2), walk.at(-1)) < 25, `${d.id}: last straight leg ${m(walk.at(-2), walk.at(-1)).toFixed(1)} m`);
    assert.ok(length(walk) < 300, `${d.id}: ${length(walk).toFixed(0)} m`);
  }
  const jaa = dests.find(d => d.id === 'plm-jaa'), gk = dests.find(d => d.id === 'plm-katipunan');
  const there = length(campusWalk([jaa.lat, jaa.lng], [gk.lat, gk.lng]));
  const back = length(campusWalk([gk.lat, gk.lng], [jaa.lat, jaa.lng]));
  assert.ok(Math.abs(there - back) < 1, `JAA->GK ${there.toFixed(1)} m but GK->JAA ${back.toFixed(1)} m`);
  console.log(`OK -- ${dests.length} campus destinations reachable along the campus ways from the gate.`);
} finally {
  await vite.close();
}
