// Opstellingen: overgenomen uit het 2D-spel (buildOffense / buildDefense), nu als pure functies.
import { Player } from './player.js';
import { PB, NUM } from '../data/plays.js';
import { clamp, norm } from './math.js';

export function buildOffense(play, los) {
  const L = los, k = L < 7 ? Math.max(0.5, (L - 1.5) / 6) : 1, fx = (d) => (d < 0 ? d * k : d), f = play.f;
  const qb = new Player('off', 'QB', L + fx(f.Q[0]), f.Q[1], 6.6, 7, 0);
  const out = [qb];
  if (f.Q[2]) qb.route = f.Q[2].map(([rd, rl]) => ({ x: L + fx(rd), y: clamp(rl, 0.8, 24.2) }));
  for (const id of ['C', 'X', 'Y', 'Z']) {
    const [d, l, rt, cont] = f[id];
    const p = new Player('off', id, L + fx(d), clamp(l, 0.8, 24.2), id === 'C' ? 6.9 : 7.3, NUM[id], 0);
    p.btn = PB[id];
    p.route = rt.map(([rd, rl]) => ({ x: Math.min(59.4, L + fx(rd)), y: clamp(rl, 0.8, 24.2) }));
    if (cont !== 0 && p.route.length) {
      const e = p.route[p.route.length - 1], pv = p.route.length > 1 ? p.route[p.route.length - 2] : { x: p.x, y: p.y };
      p.cont = norm(e.x - pv.x, e.y - pv.y);
    }
    out.push(p);
  }
  return out; // [QB, C, X, Y, Z]
}

export function buildDefense(cov, off, los) {
  const L = los, cx = (v) => Math.min(v, 59);
  const so = off.slice(1).sort((a, b) => a.y - b.y), rv = [so[0], so[3], so[1], so[2]];
  const mkD = (role, x, y, spd, num) => new Player('def', role, cx(x), y, spd, num, Math.PI);
  const D = [
    mkD('CB1', L + 5, clamp(rv[0].y + 0.8, 1, 24), 7.0, 21),
    mkD('CB2', L + 5, clamp(rv[1].y - 0.8, 1, 24), 7.0, 24),
    mkD('LB', L + 5, rv[2].y, 6.9, 52),
    mkD('FS', L + 12, 12.5, 7.0, 31),
    mkD('R', L + 7, 12.5, 6.4, 99),
  ];
  const room = 50 - L, sq = room < 10 ? Math.max(0.45, (room + 4) / 14) : 1;
  const at = (i, dx, y) => { D[i].x = cx(L + dx * sq); D[i].y = clamp(y, 1, 24); };
  if (cov.id === 'man') { at(0, 2, rv[0].y + 0.6); at(1, 2, rv[1].y - 0.6); at(2, 3.5, rv[2].y); at(3, 10, rv[3].y); }
  else if (cov.id === 'c2') { at(0, 4, rv[0].y + 1.6); at(1, 4, rv[1].y - 1.6); at(2, 12, 17.5); at(3, 12, 7.5); }
  else if (cov.id === 'c3') { at(0, 7, 4); at(1, 7, 21); at(2, 5, 8); at(3, 13, 12.5); at(4, 5, 17); }
  else if (cov.id === 'c4') { at(0, 9, 3.5); at(1, 9, 21.5); at(2, 9, 15.5); at(3, 9, 9.5); }
  else if (cov.id === 'blitz') { at(0, 2, rv[0].y + 0.6); at(1, 2, rv[1].y - 0.6); at(2, 7, 9); at(3, 8, rv[2].y); D[4].y = 16; }
  D.forEach((d, i) => {
    d.rush = !!cov.r[i];
    if (cov.m[i] != null) d.man = rv[cov.m[i]];
    if (cov.z[i]) { const z = cov.z[i]; d.zone = { x: Math.min(L + z.d * sq, 58), y: z.y, R: z.R, deep: !!z.deep }; }
  });
  return D;
}
