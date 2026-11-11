export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const hyp = Math.hypot;
export const dist = (a, b) => hyp(a.x - b.x, a.y - b.y);
export const rnd = (a, b) => a + Math.random() * (b - a);
export const norm = (x, y) => { const m = hyp(x, y) || 1; return { x: x / m, y: y / m }; };
export const gauss = () => {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// Smooth demping, framerate-onafhankelijk
export const damp = (cur, target, rate, dt) => lerp(cur, target, 1 - Math.exp(-rate * dt));
