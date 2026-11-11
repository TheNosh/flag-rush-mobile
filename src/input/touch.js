// Touch-besturing voor de mobiele versie: virtuele stick onder de linkerduim, knoppen onder de rechterduim.
// De knoppen hebben dezelfde namen als de PlayStation-knoppen in input.js (X, O, SQ, TRI, R1, R2, L1, OPT, R3),
// dus de rest van het spel merkt geen verschil.

const GLYPHS = {
  X: { t: '✕', c: '#7fa6e8' }, O: { t: '◯', c: '#ec7b85' }, SQ: { t: '□', c: '#e3a1d0' }, TRI: { t: '△', c: '#7fd9b6' },
};

export function isTouchDevice() {
  try {
    return new URLSearchParams(location.search).has('touch') || matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches;
  } catch { return false; }
}

export function createTouchControls(input) {
  const root = document.getElementById('touch');
  if (!root) return null;
  root.hidden = false;
  document.body.classList.add('is-touch');
  input.touch = true;

  const buzz = (ms = 8) => { try { navigator.vibrate && navigator.vibrate(ms); } catch { /* geen trilling */ } };

  // ---- knoppen
  const mk = (cls, key, label, sub, color) => {
    const b = document.createElement('div');
    b.className = 'tb ' + cls; b.dataset.k = key;
    b.innerHTML = '<span class="g"' + (color ? ' style="color:' + color + '"' : '') + '>' + label + '</span>' + (sub ? '<small>' + sub + '</small>' : '');
    root.appendChild(b); return b;
  };
  mk('face fx', 'X', GLYPHS.X.t, '', GLYPHS.X.c);
  mk('face fo', 'O', GLYPHS.O.t, '', GLYPHS.O.c);
  mk('face fs', 'SQ', GLYPHS.SQ.t, '', GLYPHS.SQ.c);
  mk('face ft', 'TRI', GLYPHS.TRI.t, '', GLYPHS.TRI.c);
  mk('sprint', 'R2', 'SPRINT', 'R2');
  mk('small r1', 'R1', 'R1', 'weggooien');
  mk('small l1', 'L1', 'L1', 'wissel');
  mk('mini pause', 'OPT', 'II', '');
  mk('mini cam', 'R3', 'CAM', '');

  const down = new Map(); // pointerId -> sleutel
  const press = (k, on) => {
    input.tkeys[k] = on;
    if (on) { input.latch[k] = true; buzz(k === 'R2' ? 6 : 10); }
  };
  root.addEventListener('pointerdown', (e) => {
    const b = e.target.closest && e.target.closest('.tb');
    if (!b) return;
    e.preventDefault();
    try { b.setPointerCapture(e.pointerId); } catch { /* niet nodig */ }
    down.set(e.pointerId, b.dataset.k); b.classList.add('on'); press(b.dataset.k, true);
  });
  const release = (e) => {
    const k = down.get(e.pointerId); if (!k) return;
    down.delete(e.pointerId); press(k, false);
    root.querySelector('.tb[data-k="' + k + '"]')?.classList.remove('on');
  };
  root.addEventListener('pointerup', release); root.addEventListener('pointercancel', release);

  // ---- virtuele stick (zweeft: verschijnt waar de linkerduim het scherm raakt)
  const base = document.createElement('div'); base.className = 'stick'; base.hidden = true;
  const knob = document.createElement('div'); knob.className = 'knob'; base.appendChild(knob);
  root.appendChild(base);
  const zone = document.createElement('div'); zone.className = 'zone'; root.appendChild(zone);
  let sid = null, ox = 0, oy = 0;
  const R = () => Math.max(48, Math.min(82, window.innerHeight * 0.17));
  const setStick = (x, y) => {
    const r = R(); let dx = x - ox, dy = y - oy; const m = Math.hypot(dx, dy);
    if (m > r) { ox += dx / m * (m - r); oy += dy / m * (m - r); dx = x - ox; dy = y - oy; } // de basis schuift mee
    base.style.left = ox + 'px'; base.style.top = oy + 'px';
    knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    let vx = dx / r, vy = dy / r; const L = Math.hypot(vx, vy);
    if (L < 0.12) { vx = 0; vy = 0; } else { const s = Math.min(1, (L - 0.12) / 0.78) / L; vx *= s; vy *= s; }
    input.tx = vx; input.ty = vy;
  };
  zone.addEventListener('pointerdown', (e) => {
    if (sid !== null) return; e.preventDefault();
    sid = e.pointerId; try { zone.setPointerCapture(sid); } catch { /* niet nodig */ }
    ox = e.clientX; oy = e.clientY; base.hidden = false; base.style.setProperty('--r', R() + 'px'); setStick(e.clientX, e.clientY);
  });
  zone.addEventListener('pointermove', (e) => { if (e.pointerId === sid) { e.preventDefault(); setStick(e.clientX, e.clientY); } });
  const end = (e) => { if (e.pointerId !== sid) return; sid = null; base.hidden = true; input.tx = 0; input.ty = 0; knob.style.transform = 'translate(0,0)'; };
  zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);

  // Geen contextmenu, zoom of selectie tijdens het spelen.
  for (const ev of ['contextmenu', 'gesturestart', 'dblclick']) document.addEventListener(ev, (e) => e.preventDefault());
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  // Als de pagina op de achtergrond gaat: alles loslaten (anders blijft de speler lopen).
  document.addEventListener('visibilitychange', () => { if (document.hidden) { input.tx = 0; input.ty = 0; for (const k in input.tkeys) input.tkeys[k] = false; } });
  return { root };
}
