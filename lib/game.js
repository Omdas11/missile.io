'use strict';
/* ============================================================
   missile.io — 2-minutes-in-space style survival.
   The rocket ALWAYS flies forward. Hold LEFT/RIGHT to turn
   (carves a circular path); release and it flies the tangent
   straight. Homing missiles chase you. Survive 2:00 to win.
   Plain canvas + synthesized WebAudio. No assets, no deps.
   ============================================================ */

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const hyp = Math.hypot;
const DURATION = 120;                       // survive 2:00 to win
const TURN = 2.9;                           // rad/s steering rate

let W = 0, H = 0;
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2) * Q().renderScale;
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
// initial sizing happens after S/QUALITY are defined (see bottom)

/* ---------- state (world coordinates) ---------- */
const S = {
  mode: 'menu',
  t: 0, last: 0, timeScale: 1, slowmo: 0,
  dist: 0,
  best: parseInt(localStorage.getItem('missileio_best') || '0', 10) || 0,
  bestTime: parseFloat(localStorage.getItem('missileio_besttime') || '0') || 0,
  dodged: 0, pickups: 0,
  shake: 0, hitStop: 0, flash: 0,
  muted: localStorage.getItem('missileio_mute') === '1',
  bannerAt: 0,
  camX: 0, camY: 0,          // camera top-left in world coords
};
/* ---------- difficulty ---------- */
const DIFFS = {
  easy:   { hearts: 5, spawnMul: 1.6, mSpeed: 0.85, mTurn: 0.8, fireMul: 1.5, shots: 2,
            note: '5 hearts · calmer skies' },
  normal: { hearts: 5, spawnMul: 1.0, mSpeed: 1.0,  mTurn: 1.0, fireMul: 1.0, shots: 3,
            note: '5 hearts · the real deal' },
  hard:   { hearts: 1, spawnMul: 0.7, mSpeed: 1.12, mTurn: 1.3, fireMul: 0.7, shots: 4,
            note: '1 heart · one hit and you are space dust' },
};
S.diff = localStorage.getItem('missileio_diff') || 'normal';
if (!DIFFS[S.diff]) S.diff = 'normal';
const D = () => DIFFS[S.diff];
S.scoreBest = parseInt(localStorage.getItem('missileio_scorebest') || '0', 10) || 0;

/* ---------- graphics quality ---------- */
const QUALITY = {
  low:  { renderScale: 0.7, glow: false, stars: 60,  nebula: 2, vignette: false, parts: 300, boom: 0.5, streaks: false },
  med:  { renderScale: 0.9, glow: true,  stars: 120, nebula: 3, vignette: true,  parts: 600, boom: 0.8, streaks: true },
  high: { renderScale: 1.0, glow: true,  stars: 180, nebula: 5, vignette: true,  parts: 900, boom: 1.0, streaks: true },
};
S.q = localStorage.getItem('missileio_q') || 'med';
if (!QUALITY[S.q]) S.q = 'med';
const Q = () => QUALITY[S.q];
S.showFps = localStorage.getItem('missileio_fps') === '1';
S.fps = 60;

const viewR = () => hyp(W, H) / 2 + 60;     // spawn/despawn radius

const P = {              // player = rocket, always moving forward
  x: 0, y: 0, heading: 0, speed: 290, r: 13,
  hearts: 5, maxHearts: 5,
  alive: true, shield: 0, invuln: 0, flame: 0,
};
const fwdX = () => Math.sin(P.heading);
const fwdY = () => -Math.cos(P.heading);

let asteroids = [], missiles = [], bolts = [], mines = [], ufos = [], holes = [];
let pickups = [], cores = [], parts = [], floaters = [], stars = [];

/* ---------- sprites (Kenney Space Shooter, CC0) ---------- */
const SPR = {};
function loadSprites() {
  const list = {
    ship: 'playerShip1_blue.png',
    ufo: 'ufoRed.png',
    metBig1: 'meteorBrown_big1.png', metBig2: 'meteorBrown_big2.png',
    metMed1: 'meteorBrown_med1.png', metGreyBig: 'meteorGrey_big1.png',
    metGreyMed: 'meteorGrey_med1.png', metSmall: 'meteorBrown_small1.png',
  };
  for (const k in list) {
    const img = new Image();
    img.src = '/assets/' + list[k];
    SPR[k] = img;
  }
}
loadSprites();
function spriteReady(img) { return img && img.complete && img.naturalWidth > 0; }
function drawSprite(img, x, y, size, rot) {
  const s = size / Math.max(img.naturalWidth, img.naturalHeight);
  ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot);
  ctx.drawImage(img, -img.naturalWidth * s / 2, -img.naturalHeight * s / 2,
    img.naturalWidth * s, img.naturalHeight * s);
  ctx.restore();
}

function initStars() {
  stars = [];
  const per = Math.ceil(Q().stars / 3);
  for (let layer = 0; layer < 3; layer++)
    for (let i = 0; i < per; i++)
      stars.push({ x: Math.random(), y: Math.random(), layer, tw: rand(0, TAU) });
}
initStars();

/* ---------- input: hold left/right to steer ---------- */
const steer = { left: false, right: false };
const pointers = new Map();   // pointerId -> 'left' | 'right'
function recomputeSteer() {
  steer.left = steer.keyL; steer.right = steer.keyR;
  for (const side of pointers.values()) {
    if (side === 'left') steer.left = true; else steer.right = true;
  }
}
steer.keyL = false; steer.keyR = false;
window.addEventListener('keydown', e => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') { steer.keyL = true; recomputeSteer(); }
  if (e.code === 'ArrowRight' || e.code === 'KeyD') { steer.keyR = true; recomputeSteer(); }
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  if (e.code === 'KeyM') toggleMute();
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') { steer.keyL = false; recomputeSteer(); }
  if (e.code === 'ArrowRight' || e.code === 'KeyD') { steer.keyR = false; recomputeSteer(); }
});
function sideOf(x) { return x < W / 2 ? 'left' : 'right'; }
canvas.addEventListener('pointerdown', e => {
  ensureAudio();
  pointers.set(e.pointerId, sideOf(e.clientX));
  recomputeSteer(); showSteerHint(false);
});
const endPointer = e => { pointers.delete(e.pointerId); recomputeSteer(); };
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointermove', e => {
  if (pointers.has(e.pointerId)) { pointers.set(e.pointerId, sideOf(e.clientX)); recomputeSteer(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && S.mode === 'play') setPause(true); });

/* ---------- audio (synthesized) ---------- */
let AC = null, master = null, engineOsc = null, engineGain = null;
function ensureAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = S.muted ? 0 : 0.45; master.connect(AC.destination);
    engineOsc = AC.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 48;
    const ef = AC.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 200;
    engineGain = AC.createGain(); engineGain.gain.value = 0;
    engineOsc.connect(ef); ef.connect(engineGain); engineGain.connect(master);
    engineOsc.start();
  } catch (e) { AC = null; }
}
function tone(freq, dur, type = 'square', vol = 0.12, slide = 0) {
  if (!AC || S.muted) return;
  const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function noiseBurst(dur = 0.4, vol = 0.3, freq = 800) {
  if (!AC || S.muted) return;
  const t = AC.currentTime, len = Math.floor(AC.sampleRate * dur);
  const buf = AC.createBuffer(1, len, AC.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = AC.createBufferSource(); src.buffer = buf;
  const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
  const g = AC.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(master); src.start(t);
}
const sfx = {
  hit()    { noiseBurst(0.3, 0.32, 1100); tone(150, 0.3, 'sawtooth', 0.2, -100); },
  boom()   { noiseBurst(0.5, 0.32, 700); tone(90, 0.4, 'sine', 0.22, -60); },
  bigBoom(){ noiseBurst(0.9, 0.42, 500); tone(60, 0.8, 'sine', 0.32, -40); },
  launch() { tone(rand(180, 240), 0.35, 'sawtooth', 0.07, 160); },
  zap()    { tone(rand(900, 1200), 0.12, 'sawtooth', 0.08, -500); },
  mine()   { tone(660, 0.08, 'square', 0.09); setTimeout(() => tone(660, 0.08, 'square', 0.09), 120); },
  pickup() { tone(520, 0.09, 'square', 0.09); setTimeout(() => tone(780, 0.12, 'square', 0.09), 70); },
  warn()   { tone(1180, 0.1, 'square', 0.07); },
  win()    { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'triangle', 0.14), i * 140)); },
};
function toggleMute() {
  S.muted = !S.muted;
  localStorage.setItem('missileio_mute', S.muted ? '1' : '0');
  if (master) master.gain.value = S.muted ? 0 : 0.45;
  document.getElementById('btn-mute').style.opacity = S.muted ? 0.4 : 1;
}

/* ---------- fx helpers (world coords) ---------- */
function explode(x, y, scale = 1, big = false) {
  const n = Math.floor((big ? 46 : 22) * scale * Q().boom);
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), sp = rand(30, big ? 320 : 220) * scale;
    puff(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.35, big ? 1.1 : 0.8),
      rand(1.5, big ? 5 : 3.5) * scale, Math.random() < 0.55 ? 'fire' : (Math.random() < 0.5 ? 'spark' : 'smoke'));
  }
  puff(x, y, 0, 0, 0.14, (big ? 46 : 26) * scale, 'flash');
  puff(x, y, 0, 0, big ? 0.5 : 0.32, (big ? 70 : 40) * scale, 'ring');   // shockwave
  S.shake = Math.min(S.shake + (big ? 14 : 6) * scale, 22);
  big ? sfx.bigBoom() : sfx.boom();
}
function puff(x, y, vx, vy, life, r, kind) {
  if (parts.length > Q().parts) return;
  parts.push({ x, y, vx, vy, t: 0, life, r, kind });
}
function floater(x, y, txt, color = '#fff') {
  floaters.push({ x, y, txt, color, t: 0, life: 1 });
}
function banner(txt, color = '#fff', sub = '') {
  const el = document.getElementById('wavebanner');
  el.innerHTML = txt + (sub ? '<div style="font-size:16px;letter-spacing:4px;margin-top:8px;opacity:.8">' + sub + '</div>' : '');
  el.style.color = color;
  el.classList.remove('hidden');
  el.style.animation = 'none'; void el.offsetHeight; el.style.animation = '';
  clearTimeout(banner._t);
  banner._t = setTimeout(() => el.classList.add('hidden'), 2450);
}
function showSteerHint(show) {
  document.getElementById('steerhint').classList.toggle('hidden', !show);
}

/* ---------- damage ---------- */
function damagePlayer(amount, sx, sy) {
  if (!P.alive || P.invuln > 0) return;
  if (P.shield > 0) {
    puff(P.x, P.y, rand(-80, 80), rand(-80, 80), 0.4, 3, 'spark');
    tone(300, 0.15, 'square', 0.09, 150);
    return;
  }
  P.hearts -= 1;
  P.invuln = 1.0;
  S.streak = 0; S.streakT = 0;   // damage breaks the core streak
  explode(sx, sy, 0.7);
  sfx.hit();
  S.hitStop = 0.05; S.flash = 0.25;
  if (P.hearts <= 0) {
    P.hearts = 0; P.alive = false;
    explode(P.x, P.y, 1.7, true);
    setTimeout(() => endRun(false), 1000);
  }
  renderHearts();
}
const HEART_SVG = '<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
function renderHearts() {
  let html = '';
  for (let i = 0; i < P.maxHearts; i++)
    html += '<span class="heart' + (i < P.hearts ? ' on' : '') + '">' + HEART_SVG + '</span>';
  document.getElementById('hearts').innerHTML = html;
  document.getElementById('score').textContent = S.score;
  document.getElementById('best').textContent = 'BEST ' + S.scoreBest;
}

/* ================= spawners & obstacles (world coords) ================= */

function resetRun() {
  S.t = 0; S.dist = 0; S.timeScale = 1; S.slowmo = 0;
  S.score = 0; S.streak = 0; S.streakT = 0;
  S.dodged = 0; S.pickups = 0; S.coresGot = 0;
  S.shake = 0; S.hitStop = 0; S.flash = 0; S.bannerAt = 0;
  asteroids = []; missiles = []; bolts = []; mines = []; ufos = []; holes = [];
  pickups = []; cores = []; parts = []; floaters = [];
  P.x = 0; P.y = 0; P.heading = 0; P.speed = 290;
  P.maxHearts = D().hearts; P.hearts = P.maxHearts;
  P.alive = true; P.shield = 0; P.invuln = 1.5;
  S.camX = -W / 2; S.camY = -H / 2;
  pointers.clear(); steer.keyL = steer.keyR = false; recomputeSteer();
  spawnT.asteroid = 0.5; spawnT.missile = 9; spawnT.ufo = 16;
  spawnT.mine = 24; spawnT.hole = 45; spawnT.pickup = 7; spawnT.core = 1.2;
}
const spawnT = { asteroid: 0, missile: 0, ufo: 0, mine: 0, hole: 0, pickup: 0, core: 0 };
const diff = () => clamp(S.t / DURATION, 0, 1);

/* random world point on a ring just outside the view, centered on camera */
function ringPoint(rad) {
  const cx = S.camX + W / 2, cy = S.camY + H / 2;
  const a = rand(0, TAU), r = rad || viewR();
  return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
}
const farFromPlayer = (e, margin) => hyp(P.x - e.x, P.y - e.y) > viewR() + (margin || 300);

function spawnDirector(dt) {
  const d = diff(), t = S.t;
  for (const k in spawnT) spawnT[k] -= dt;

  if (spawnT.asteroid <= 0) {
    const p = ringPoint(); spawnAsteroid(p.x, p.y);
    spawnT.asteroid = lerp(1.0, 0.3, d) * D().spawnMul * rand(0.6, 1.3);
    if (d > 0.5 && Math.random() < 0.45) { const q = ringPoint(); spawnAsteroid(q.x, q.y); }
  }
  if (t > 12 && spawnT.missile <= 0) {
    const n = t > 100 ? 3 : (d > 0.55 ? 2 : 1);
    for (let i = 0; i < n; i++) setTimeout(spawnMissile, i * 400);
    spawnT.missile = lerp(7, 2.8, d) * D().spawnMul * rand(0.8, 1.2);
  }
  if (t > 25 && spawnT.ufo <= 0) { spawnUfo(); spawnT.ufo = lerp(11, 5, d) * D().spawnMul * rand(0.8, 1.3); }
  if (t > 40 && spawnT.mine <= 0) {
    const n = randi(2, 4);
    for (let i = 0; i < n; i++) { const p = ringPoint(viewR() * rand(0.7, 1)); spawnMine(p.x, p.y); }
    spawnT.mine = lerp(12, 6, d) * D().spawnMul;
  }
  if (t > 60 && spawnT.hole <= 0) { const p = ringPoint(); spawnHole(p.x, p.y); spawnT.hole = rand(15, 24) * D().spawnMul; }
  if (spawnT.pickup <= 0) { spawnPickup(); spawnT.pickup = rand(9, 14); }
  // score cores: little arcs of collectibles laid ahead of the rocket
  if (spawnT.core <= 0) { spawnCoreArc(); spawnT.core = rand(1.1, 1.7); }

  const marks = [
    [30, '30 SECONDS', '#8fb8ff'], [60, 'HALFWAY THERE', '#ffd76a'],
    [90, 'FINAL 30', '#ffb02e'], [110, 'MISSILE STORM', '#ff6b6b'],
  ];
  for (const [mt, txt, c] of marks)
    if (S.bannerAt < mt && t >= mt) { S.bannerAt = mt; banner(txt, c); tone(440, 0.2, 'triangle', 0.12); }
}

/* ----- obstacles ----- */
function spawnAsteroid(x, y) {
  const r = rand(14, 34 + diff() * 14);
  const pool = r > 26 ? ['metBig1', 'metBig2', 'metGreyBig']
             : r > 16 ? ['metMed1', 'metGreyMed'] : ['metSmall'];
  asteroids.push({
    x, y, vx: rand(-40, 40), vy: rand(-40, 40),
    r, rot: rand(0, TAU), vr: rand(-1.2, 1.2),
    verts: Array.from({ length: 9 }, () => rand(0.72, 1.15)),
    spr: pool[randi(0, pool.length - 1)],
  });
}
function spawnMissile() {
  if (S.mode !== 'play' || !P.alive) return;
  const p = ringPoint();
  const sp = P.speed * rand(0.88, 0.97) * D().mSpeed;   // slightly slower: outrunnable, but they cut corners
  const a = Math.atan2(P.y - p.y, P.x - p.x);
  missiles.push({
    x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
    r: 7, t: 0, life: rand(7, 9), speed: sp, turn: (rand(2.6, 3.4) + diff() * 0.8) * D().mTurn,
    warned: false,
  });
  sfx.launch();
}
function spawnUfo() {
  const p = ringPoint();
  ufos.push({
    x: p.x, y: p.y, vx: rand(-1, 1), vy: rand(-1, 1), r: 18,
    t: 0, fireT: rand(0.8, 1.6), shots: randi(2, D().shots + Math.floor(diff() * 2)),
    wob: rand(0, TAU),
  });
  const u = ufos[ufos.length - 1];
  const a = Math.atan2(P.y - u.y, P.x - u.x) + rand(-0.5, 0.5);
  const sp = rand(70, 110);
  u.vx = Math.cos(a) * sp; u.vy = Math.sin(a) * sp;
}
function spawnMine(x, y) { mines.push({ x, y, r: 14, t: 0, armed: false, beepT: 0 }); }
function spawnHole(x, y) { holes.push({ x, y, r: 26, pull: 300, t: 0 }); }

/* ----- score cores ----- */
function spawnCoreArc() {
  const ahead = viewR() * rand(0.45, 0.7);
  const dx = fwdX(), dy = fwdY();
  const cx = P.x + dx * ahead, cy = P.y + dy * ahead;
  const n = randi(4, 6), spread = rand(34, 46), bend = rand(-1, 1) * 30;
  const px = -dy, py = dx;                       // perpendicular
  for (let i = 0; i < n; i++) {
    const o = (i - (n - 1) / 2);
    cores.push({
      x: cx + px * o * spread + dx * Math.abs(o) * bend * 0.4,
      y: cy + py * o * spread + dy * Math.abs(o) * bend * 0.4,
      r: 11, t: rand(0, TAU), got: false,
    });
  }
}
function updateCores(dt) {
  if (S.streakT > 0) { S.streakT -= dt; if (S.streakT <= 0) S.streak = 0; }
  for (let i = cores.length - 1; i >= 0; i--) {
    const c = cores[i];
    c.t += dt;
    if (P.alive && hyp(P.x - c.x, P.y - c.y) < c.r + P.r + 6) {
      S.coresGot++;
      S.streak = S.streakT > 0 ? S.streak + 1 : 1;
      S.streakT = 4;
      let v = 10;
      if (S.streak > 0 && S.streak % 8 === 0) { v += 50; floater(c.x, c.y - 24, 'STREAK x' + S.streak + '!', '#ffd76a'); }
      S.score += v;
      floater(c.x, c.y - 12, '+' + v, '#8ef7ff');
      tone(660 + Math.min(S.streak, 12) * 30, 0.09, 'sine', 0.09);
      puff(c.x, c.y, 0, 0, 0.3, 10, 'flash');
      cores.splice(i, 1);
      renderHearts();
      continue;
    }
    if (farFromPlayer(c)) cores.splice(i, 1);
  }
}

const PK = {
  S: { color: '#6db7ff', name: 'SHIELD' },
  H: { color: '#ff7d9c', name: 'HEART' },
  T: { color: '#c99aff', name: 'SLOW-MO' },
};
function spawnPickup() {
  // ahead of the rocket, slightly to one side
  const ahead = viewR() * 0.75, side = rand(-1, 1) * viewR() * 0.5;
  const dx = fwdX(), dy = fwdY();
  const x = P.x + dx * ahead - dy * side, y = P.y + dy * ahead + dx * side;
  const keys = ['S', 'H', 'T'];
  const k = P.hearts < P.maxHearts && Math.random() < 0.5 ? 'H' : keys[randi(0, 2)];
  pickups.push({ x, y, r: 14, t: 0, kind: k });
}
function applyPickup(p) {
  S.pickups++;
  sfx.pickup();
  puff(p.x, p.y, 0, 0, 0.4, 16, 'flash');
  if (p.kind === 'S') { P.shield = 9; floater(p.x, p.y - 22, 'SHIELD!', PK.S.color); }
  else if (p.kind === 'H') {
    if (P.hearts < P.maxHearts) { P.hearts++; floater(p.x, p.y - 22, '+1 HEART!', PK.H.color); }
    else floater(p.x, p.y - 22, 'HEARTS FULL', PK.H.color);
  }
  else if (p.kind === 'T') { S.slowmo = 4; floater(p.x, p.y - 22, 'SLOW-MO!', PK.T.color); }
  refreshBuffs(); renderHearts();
}
function refreshBuffs() {
  const el = document.getElementById('buffs');
  el.innerHTML = '';
  const add = (txt, warn) => {
    const s = document.createElement('span');
    s.className = 'buff' + (warn ? ' warn' : ''); s.textContent = txt; el.appendChild(s);
  };
  if (P.shield > 0) add('SHIELD ' + Math.ceil(P.shield) + 's');
  if (S.slowmo > 0) add('SLOW-MO ' + Math.ceil(S.slowmo) + 's');
}

/* ================= updates ================= */

function updatePlayer(dt) {
  // steering: hold left/right -> heading rotates (circular path);
  // release -> flies the tangent straight. Always moving forward.
  if (steer.left) P.heading -= TURN * dt;
  if (steer.right) P.heading += TURN * dt;
  P.speed = 290 + diff() * 60;
  P.x += fwdX() * P.speed * dt;
  P.y += fwdY() * P.speed * dt;
  S.dist += P.speed * dt / 34;
  P.flame = 0.6 + Math.random() * 0.4;
  if (P.shield > 0) P.shield -= dt;
  if (P.invuln > 0) P.invuln -= dt;
  // smoke trail
  if (Math.random() < 0.7)
    puff(P.x - fwdX() * 16, P.y - fwdY() * 16, rand(-15, 15), rand(-15, 15), rand(0.4, 0.8), rand(2, 4), 'smoke');
  // camera follows with slight lookahead
  const lx = P.x + fwdX() * P.speed * 0.22, ly = P.y + fwdY() * P.speed * 0.22;
  S.camX = lerp(S.camX, lx - W / 2, 1 - Math.pow(0.001, dt));
  S.camY = lerp(S.camY, ly - H / 2, 1 - Math.pow(0.001, dt));
  refreshBuffs();
}

function updateMissiles(dt) {
  let incoming = false;
  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i];
    m.t += dt; m.life -= dt;
    const dx = P.x - m.x, dy = P.y - m.y, d = hyp(dx, dy) || 1;
    // homing steer toward the rocket
    const desX = dx / d * m.speed, desY = dy / d * m.speed;
    const k = clamp(m.turn * dt, 0, 1);
    m.vx = lerp(m.vx, desX, k); m.vy = lerp(m.vy, desY, k);
    const s = hyp(m.vx, m.vy) || 1;
    m.vx = m.vx / s * m.speed; m.vy = m.vy / s * m.speed;
    m.x += m.vx * dt; m.y += m.vy * dt;
    if (Math.random() < 0.85)
      puff(m.x, m.y, rand(-10, 10), rand(-10, 10), rand(0.3, 0.6), rand(2, 4), 'smoke');

    if (d < 320) { incoming = true; if (!m.warned) { m.warned = true; sfx.warn(); } }
    if (P.alive && d < m.r + P.r) {
      explode(m.x, m.y, 0.9);
      missiles.splice(i, 1);
      damagePlayer(25, m.x, m.y);
      continue;
    }
    // missile hits an asteroid -> both burst
    let burst = false;
    for (let j = asteroids.length - 1; j >= 0; j--) {
      const a = asteroids[j];
      if (hyp(m.x - a.x, m.y - a.y) < m.r + a.r * 0.8) {
        explode(m.x, m.y, 0.8);
        explode(a.x, a.y, a.r / 22);
        asteroids.splice(j, 1);
        burst = true;
        break;
      }
    }
    if (burst) { missiles.splice(i, 1); continue; }
    if (m.life <= 0) {
      if (d < 260) { S.dodged++; floater(m.x, m.y, 'DODGED!', '#8fb8ff'); }
      puff(m.x, m.y, 0, 0, 0.3, 8, 'smoke');
      missiles.splice(i, 1);
    }
  }
  // missile-vs-missile: crossing trajectories detonate each other
  const doomed = new Set();
  for (let i = 0; i < missiles.length; i++) {
    if (doomed.has(i)) continue;
    for (let j = i + 1; j < missiles.length; j++) {
      if (doomed.has(j)) continue;
      const a = missiles[i], b = missiles[j];
      if (hyp(a.x - b.x, a.y - b.y) < a.r + b.r + 8) {
        doomed.add(i); doomed.add(j);
        const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        explode(cx, cy, 0.9);
        floater(cx, cy - 18, 'CLASH!', '#ffd76a');
        S.dodged += 2;
        break;
      }
    }
  }
  if (doomed.size) missiles = missiles.filter((_, i) => !doomed.has(i));

  document.getElementById('incoming').classList.toggle('hidden', !incoming);
}

function updateAsteroids(dt) {
  for (let i = asteroids.length - 1; i >= 0; i--) {
    const a = asteroids[i];
    a.x += a.vx * dt; a.y += a.vy * dt; a.rot += a.vr * dt;
    if (P.alive && hyp(P.x - a.x, P.y - a.y) < a.r * 0.85 + P.r) {
      explode(a.x, a.y, a.r / 22);
      asteroids.splice(i, 1);
      damagePlayer(Math.round(10 + a.r * 0.5), a.x, a.y);
      continue;
    }
    if (farFromPlayer(a)) asteroids.splice(i, 1);
  }
}

function updateUfos(dt) {
  for (let i = ufos.length - 1; i >= 0; i--) {
    const u = ufos[i];
    u.t += dt; u.fireT -= dt;
    u.x += u.vx * dt; u.y += u.vy * dt;
    if (u.fireT <= 0 && u.shots > 0 && P.alive && hyp(P.x - u.x, P.y - u.y) < viewR()) {
      u.shots--; u.fireT = rand(0.7, 1.3) * D().fireMul;
      // lead the target slightly
      const tof = hyp(P.x - u.x, P.y - u.y) / 320;
      const tx = P.x + fwdX() * P.speed * tof * 0.6, ty = P.y + fwdY() * P.speed * tof * 0.6;
      const a = Math.atan2(ty - u.y, tx - u.x), sp = 300 + diff() * 80;
      bolts.push({ x: u.x, y: u.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 5, t: 0, life: 3.5 });
      sfx.zap();
      puff(u.x, u.y, 0, 0, 0.15, 7, 'flash');
    }
    if (P.alive && hyp(P.x - u.x, P.y - u.y) < u.r + P.r) {
      explode(u.x, u.y, 1); ufos.splice(i, 1);
      damagePlayer(20, u.x, u.y); continue;
    }
    if (farFromPlayer(u, 500)) ufos.splice(i, 1);
  }
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i];
    b.t += dt; b.life -= dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (P.alive && hyp(P.x - b.x, P.y - b.y) < b.r + P.r) {
      puff(b.x, b.y, 0, 0, 0.2, 6, 'flash');
      bolts.splice(i, 1);
      damagePlayer(12, b.x, b.y); continue;
    }
    if (b.life <= 0 || farFromPlayer(b, 200)) bolts.splice(i, 1);
  }
}

function updateMines(dt) {
  for (let i = mines.length - 1; i >= 0; i--) {
    const m = mines[i];
    m.t += dt;
    const d = hyp(P.x - m.x, P.y - m.y);
    if (!m.armed && d < 130) { m.armed = true; sfx.mine(); }
    if (m.armed) {
      m.beepT -= dt;
      if (m.beepT <= 0) { m.beepT = 0.28; tone(880, 0.06, 'square', 0.06); }
      if (d < 75) {
        explode(m.x, m.y, 1.4, true);
        mines.splice(i, 1);
        if (d < 100) damagePlayer(35, m.x, m.y);
        continue;
      }
    }
    if (P.alive && d < m.r + P.r) {
      explode(m.x, m.y, 1.2, true);
      mines.splice(i, 1);
      damagePlayer(35, m.x, m.y); continue;
    }
    if (farFromPlayer(m)) mines.splice(i, 1);
  }
}

function updateHoles(dt) {
  for (let i = holes.length - 1; i >= 0; i--) {
    const h = holes[i];
    h.t += dt;
    const dx = h.x - P.x, dy = h.y - P.y, d = hyp(dx, dy) || 1;
    if (P.alive && d < 240) {          // gravitational pull bends your path
      const pull = h.pull * (1 - d / 240) * dt;
      P.x += dx / d * pull; P.y += dy / d * pull;
    }
    if (Math.random() < 0.5) {
      const a = rand(0, TAU), rr = rand(h.r * 1.2, h.r * 2.2);
      puff(h.x + Math.cos(a) * rr, h.y + Math.sin(a) * rr,
        -Math.cos(a) * 60, -Math.sin(a) * 60, 0.5, 2.5, 'spark');
    }
    if (P.alive && d < h.r + P.r) {
      explode(P.x, P.y, 1.2, true);
      damagePlayer(50, P.x, P.y);
    }
    if (farFromPlayer(h)) holes.splice(i, 1);
  }
}

function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.t += dt;
    if (P.alive && hyp(P.x - p.x, P.y - p.y) < p.r + P.r + 6) {
      applyPickup(p);
      pickups.splice(i, 1); continue;
    }
    if (farFromPlayer(p)) pickups.splice(i, 1);
  }
}

function updateParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.t += dt;
    if (p.t >= p.life) { parts.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.kind === 'smoke') { p.vx *= 0.98; p.vy *= 0.98; p.r += 6 * dt; }
    if (p.kind === 'fire') { p.vx *= 0.94; p.vy *= 0.94; }
  }
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.t += dt; f.y -= 40 * dt;
    if (f.t >= f.life) floaters.splice(i, 1);
  }
}

/* ================= rendering ================= */
const sx = x => x - S.camX;      // world -> screen
const sy = y => y - S.camY;

function drawBackground(dt) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#04060f'); g.addColorStop(0.55, '#0a1030'); g.addColorStop(1, '#1a0f2e');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // layered nebulae with slight parallax (count by quality)
  const nebs = [
    ['#243b8f', 0.20, 0.25, 200], ['#5b2a86', 0.85, 0.55, 240],
    ['#0f4c5c', 0.60, 0.85, 180], ['#6a1b3d', 0.35, 0.65, 150],
    ['#3d2a86', 0.10, 0.70, 170],
  ];
  ctx.save(); ctx.globalAlpha = 0.55;
  for (let i = 0; i < Q().nebula && i < nebs.length; i++) {
    const [c, fx, fy, r] = nebs[i];
    nebula(c, W * fx - (S.camX * 0.05 % 400), H * fy - (S.camY * 0.05 % 400), r);
  }
  ctx.restore();

  // parallax starfield, tiled to screen
  const par = [0.25, 0.55, 1];
  for (const s of stars) {
    const p = par[s.layer];
    let X = (s.x * W - S.camX * p) % W; if (X < 0) X += W;
    let Y = (s.y * H - S.camY * p) % H; if (Y < 0) Y += H;
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(S.t * 2 + s.tw));
    ctx.globalAlpha = tw * (0.35 + s.layer * 0.3);
    ctx.fillStyle = '#cfe2ff';
    const r = 1 + s.layer * 0.8;
    ctx.fillRect(X, Y, r, r);
  }
  ctx.globalAlpha = 1;

  // vignette
  if (Q().vignette) {
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(2,3,10,0.55)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }

  // speed streaks along heading
  if (S.mode === 'play' && P.alive && Q().streaks) {
    ctx.strokeStyle = 'rgba(160,200,255,0.18)'; ctx.lineWidth = 1.5;
    const dx = fwdX(), dy = fwdY(), px = sx(P.x), py = sy(P.y);
    for (let i = 0; i < 10; i++) {
      const a = rand(0, TAU), rr = rand(120, 320);
      const bx = px + Math.cos(a) * rr, by = py + Math.sin(a) * rr;
      const len = rand(24, 60);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx - dx * len, by - dy * len);
      ctx.stroke();
    }
  }
}
function nebula(color, x, y, r) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color + '55'); g.addColorStop(1, color + '00');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function drawRocket() {
  if (!P.alive) return;
  ctx.save();
  ctx.translate(sx(P.x), sy(P.y));
  if (P.invuln > 0 && Math.floor(S.t * 12) % 2 === 0) ctx.globalAlpha = 0.35;
  ctx.rotate(P.heading);   // heading 0 = up

  const fl = 14 + P.flame * 14;
  ctx.save();
  if (Q().glow) { ctx.shadowColor = '#ffb02e'; ctx.shadowBlur = 20; }
  const fg = ctx.createLinearGradient(0, 14, 0, 14 + fl);
  fg.addColorStop(0, '#fff7cc'); fg.addColorStop(0.4, '#ffb02e'); fg.addColorStop(1, 'rgba(255,90,40,0)');
  ctx.fillStyle = fg;
  ctx.beginPath(); ctx.moveTo(-6, 14); ctx.lineTo(0, 14 + fl); ctx.lineTo(6, 14); ctx.closePath(); ctx.fill();
  ctx.restore();

  // hull: open-source sprite when loaded, vector fallback otherwise
  if (spriteReady(SPR.ship)) {
    const img = SPR.ship, s = 48 / Math.max(img.naturalWidth, img.naturalHeight);
    ctx.save();
    if (Q().glow) { ctx.shadowColor = 'rgba(140,180,255,0.8)'; ctx.shadowBlur = 12; }
    ctx.drawImage(img, -img.naturalWidth * s / 2, -img.naturalHeight * s / 2,
      img.naturalWidth * s, img.naturalHeight * s);
    ctx.restore();
  } else {
  // hull with metallic gradient + glow
  ctx.save();
  if (Q().glow) { ctx.shadowColor = 'rgba(140,180,255,0.8)'; ctx.shadowBlur = 12; }
  const hg = ctx.createLinearGradient(-7, 0, 7, 0);
  hg.addColorStop(0, '#8fa8d8'); hg.addColorStop(0.5, '#f2f7ff'); hg.addColorStop(1, '#8fa8d8');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.moveTo(0, -20); ctx.lineTo(7, -4); ctx.lineTo(7, 12); ctx.lineTo(-7, 12); ctx.lineTo(-7, -4);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  // vector details (fallback only)
  ctx.fillStyle = '#ff5a5a';
  ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(5, -8); ctx.lineTo(-5, -8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#274b8f';
  ctx.beginPath(); ctx.ellipse(0, -2, 3.4, 6, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#9db8e8';
  ctx.beginPath(); ctx.moveTo(-7, 2); ctx.lineTo(-17, 14); ctx.lineTo(-7, 12); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(7, 2); ctx.lineTo(17, 14); ctx.lineTo(7, 12); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ff5a5a';
  ctx.fillRect(-17, 11, 5, 3); ctx.fillRect(12, 11, 5, 3);
  }

  if (P.shield > 0) {
    ctx.strokeStyle = 'rgba(110,180,255,' + (0.5 + 0.3 * Math.sin(S.t * 8)) + ')';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 24, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}

function drawAsteroid(a) {
  const X = sx(a.x), Y = sy(a.y);
  if (spriteReady(SPR[a.spr])) {
    drawSprite(SPR[a.spr], X, Y, a.r * 2.15, a.rot);
    return;
  }
  ctx.save(); ctx.translate(X, Y); ctx.rotate(a.rot);
  const ag = ctx.createRadialGradient(-a.r * 0.3, -a.r * 0.3, a.r * 0.1, 0, 0, a.r * 1.1);
  ag.addColorStop(0, '#8a7568'); ag.addColorStop(0.55, '#5a4a42'); ag.addColorStop(1, '#33291f');
  ctx.fillStyle = ag;
  ctx.strokeStyle = '#a08a76'; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < a.verts.length; i++) {
    const ang = i / a.verts.length * TAU, rr = a.r * a.verts[i];
    i ? ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr) : ctx.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // craters
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.arc(-a.r * 0.25, -a.r * 0.2, a.r * 0.28, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(a.r * 0.3, a.r * 0.25, a.r * 0.18, 0, TAU); ctx.fill();
  // rim light (top-left)
  ctx.strokeStyle = 'rgba(255,225,190,0.4)'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(0, 0, a.r * 0.93, Math.PI * 0.9, Math.PI * 1.6); ctx.stroke();
  ctx.restore();
}

function drawMissile(m) {
  const a = Math.atan2(m.vy, m.vx);
  ctx.save(); ctx.translate(sx(m.x), sy(m.y)); ctx.rotate(a);
  if (Q().glow) { ctx.shadowColor = '#ff7a4d'; ctx.shadowBlur = 12; }
  ctx.fillStyle = '#f2f2f2';
  ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(4, -4); ctx.lineTo(-8, -4); ctx.lineTo(-8, 4); ctx.lineTo(4, 4); ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ff5a5a'; ctx.fillRect(-8, -4, 4, 8);
  const fl = 8 + Math.random() * 8;
  const fg = ctx.createLinearGradient(-12, 0, -12 - fl, 0);
  fg.addColorStop(0, '#fff7cc'); fg.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = fg;
  ctx.beginPath(); ctx.moveTo(-12, -3); ctx.lineTo(-12 - fl, 0); ctx.lineTo(-12, 3); ctx.closePath(); ctx.fill();
  if (Math.floor(S.t * 10) % 2 === 0) { ctx.fillStyle = '#ff3b3b'; ctx.beginPath(); ctx.arc(10, 0, 2.5, 0, TAU); ctx.fill(); }
  ctx.restore();
}

function drawUfo(u) {
  const X = sx(u.x), Y = sy(u.y);
  if (spriteReady(SPR.ufo)) {
    // hover glow + sprite
    const ug = ctx.createRadialGradient(X, Y + 4, 2, X, Y + 4, 26);
    ug.addColorStop(0, 'rgba(255,120,120,0.45)'); ug.addColorStop(1, 'rgba(255,120,120,0)');
    ctx.fillStyle = ug;
    ctx.beginPath(); ctx.arc(X, Y + 4, 26, 0, TAU); ctx.fill();
    drawSprite(SPR.ufo, X, Y, 46, 0);
    return;
  }
  ctx.save(); ctx.translate(X, Y);
  // hover glow
  const ug = ctx.createRadialGradient(0, 4, 2, 0, 4, 26);
  ug.addColorStop(0, 'rgba(61,220,132,0.5)'); ug.addColorStop(1, 'rgba(61,220,132,0)');
  ctx.fillStyle = ug;
  ctx.beginPath(); ctx.arc(0, 4, 26, 0, TAU); ctx.fill();
  ctx.fillStyle = '#3ddc84';
  ctx.beginPath(); ctx.ellipse(0, 0, 18, 7, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#9ff5c4';
  ctx.beginPath(); ctx.ellipse(0, -5, 8, 6, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#063';
  for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(i * 7, 3, 2, 0, TAU); ctx.fill(); }
  ctx.restore();
}

function drawMine(m) {
  ctx.save(); ctx.translate(sx(m.x), sy(m.y)); ctx.rotate(m.t * 0.8);
  const blink = m.armed ? (Math.floor(S.t * 8) % 2 === 0) : (Math.floor(S.t * 2) % 2 === 0);
  ctx.fillStyle = '#2b2f3a';
  ctx.beginPath(); ctx.arc(0, 0, m.r, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#8a93a8'; ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * m.r, Math.sin(a) * m.r);
    ctx.lineTo(Math.cos(a) * (m.r + 6), Math.sin(a) * (m.r + 6)); ctx.stroke();
    ctx.fillStyle = '#8a93a8'; ctx.beginPath(); ctx.arc(Math.cos(a) * (m.r + 6), Math.sin(a) * (m.r + 6), 2.5, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = blink ? '#ff3b3b' : '#5a1620';
  ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, TAU); ctx.fill();
  if (blink) { ctx.strokeStyle = 'rgba(255,60,60,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, m.r + 5, 0, TAU); ctx.stroke(); }
  ctx.restore();
}

function drawHole(h) {
  ctx.save(); ctx.translate(sx(h.x), sy(h.y));
  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, h.r * 2.4);
  g.addColorStop(0, '#000'); g.addColorStop(0.45, '#0a0a18');
  g.addColorStop(0.6, 'rgba(150,110,255,0.55)'); g.addColorStop(1, 'rgba(150,110,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, h.r * 2.4, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(190,150,255,0.7)'; ctx.lineWidth = 2;
  ctx.save(); ctx.rotate(h.t * 2);
  ctx.beginPath(); ctx.ellipse(0, 0, h.r * 1.5, h.r * 0.8, 0, 0, TAU); ctx.stroke();
  ctx.restore();
  // outer dashed accretion ring, counter-rotating
  ctx.save(); ctx.rotate(-h.t * 1.2);
  ctx.strokeStyle = 'rgba(255,170,220,0.35)'; ctx.lineWidth = 3;
  ctx.setLineDash([10, 14]);
  ctx.beginPath(); ctx.ellipse(0, 0, h.r * 2.1, h.r * 1.1, 0, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore(); ctx.restore();
}

function drawPickup(p) {
  const d = PK[p.kind];
  ctx.save(); ctx.translate(sx(p.x), sy(p.y) + Math.sin(p.t * 4) * 3);
  ctx.strokeStyle = d.color; ctx.lineWidth = 2.5;
  ctx.fillStyle = 'rgba(5,10,25,0.8)';
  ctx.beginPath(); ctx.arc(0, 0, p.r, 0, TAU); ctx.fill(); ctx.stroke();
  // glow pulse
  ctx.save();
  if (Q().glow) { ctx.shadowColor = d.color; ctx.shadowBlur = 14; }
  drawPickupIcon(p.kind, d.color);
  ctx.restore();
  if (Math.floor(S.t * 3) % 2 === 0) {
    ctx.strokeStyle = d.color + '66';
    ctx.beginPath(); ctx.arc(0, 0, p.r + 5, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}

function drawCores() {
  for (const c of cores) {
    const X = sx(c.x), Y = sy(c.y);
    if (X < -40 || X > W + 40 || Y < -40 || Y > H + 40) continue;
    const pulse = 0.75 + 0.25 * Math.sin(c.t * 6);
    ctx.save(); ctx.translate(X, Y); ctx.rotate(c.t * 1.5);
    if (Q().glow) { ctx.shadowColor = '#8ef7ff'; ctx.shadowBlur = 12; }
    const r = c.r * pulse;
    ctx.fillStyle = '#bdf6ff';
    ctx.beginPath();                       // 4-point sparkle crystal
    ctx.moveTo(0, -r); ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.quadraticCurveTo(0, 0, 0, r); ctx.quadraticCurveTo(0, 0, -r, 0);
    ctx.quadraticCurveTo(0, 0, 0, -r);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(X, Y, 2.5 * pulse, 0, TAU); ctx.fill();
  }
}

function drawPickupIcon(kind, color) {
  ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 2.5;
  ctx.beginPath();
  if (kind === 'S') {                    // shield
    ctx.moveTo(0, -8); ctx.lineTo(6, -5); ctx.lineTo(6, 1);
    ctx.quadraticCurveTo(6, 6, 0, 9); ctx.quadraticCurveTo(-6, 6, -6, 1);
    ctx.lineTo(-6, -5); ctx.closePath();
  } else if (kind === 'H') {             // heart
    ctx.moveTo(0, 8);
    ctx.bezierCurveTo(-9, 1, -7, -7, 0, -3);
    ctx.bezierCurveTo(7, -7, 9, 1, 0, 8);
  } else {                               // clock (slow-mo)
    ctx.arc(0, 0, 7, 0, TAU);
    ctx.moveTo(0, 0); ctx.lineTo(0, -5);
    ctx.moveTo(0, 0); ctx.lineTo(3.5, 1.5);
  }
  ctx.fill(); ctx.stroke();
}

function drawParts() {
  for (const p of parts) {
    const X = sx(p.x), Y = sy(p.y);
    if (X < -60 || X > W + 60 || Y < -60 || Y > H + 60) continue;
    const k = 1 - p.t / p.life;
    if (p.kind === 'flash') {
      ctx.globalAlpha = k * 0.9;
      const g = ctx.createRadialGradient(X, Y, 0, X, Y, p.r);
      g.addColorStop(0, '#fff'); g.addColorStop(0.5, 'rgba(255,200,120,0.7)'); g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(X, Y, p.r, 0, TAU); ctx.fill();
    } else if (p.kind === 'fire') {
      ctx.globalAlpha = k;
      ctx.fillStyle = k > 0.5 ? '#ffd76a' : '#ff7a3c';
      ctx.beginPath(); ctx.arc(X, Y, p.r * k, 0, TAU); ctx.fill();
    } else if (p.kind === 'spark') {
      ctx.globalAlpha = k;
      ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X - p.vx * 0.03, Y - p.vy * 0.03); ctx.stroke();
    } else if (p.kind === 'ring') {
      ctx.globalAlpha = k * 0.8;
      ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 3 * k + 1;
      ctx.beginPath(); ctx.arc(X, Y, p.r * (1 - k * 0.85), 0, TAU); ctx.stroke();
    } else {
      ctx.globalAlpha = k * 0.35;
      ctx.fillStyle = '#9aa4b8';
      ctx.beginPath(); ctx.arc(X, Y, p.r, 0, TAU); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  for (const f of floaters) {
    const k = 1 - f.t / f.life;
    ctx.globalAlpha = k;
    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = f.color;
    ctx.fillText(f.txt, sx(f.x), sy(f.y));
  }
  ctx.globalAlpha = 1;
}

/* ================= main loop ================= */

function update(dt) {
  S.t += dt;
  if (S.slowmo > 0) { S.slowmo -= dt; S.timeScale = 0.35; }
  else S.timeScale = lerp(S.timeScale, 1, dt * 4);
  const sdt = dt * S.timeScale;

  if (S.t >= DURATION) { endRun(true); return; }

  spawnDirector(sdt);
  updatePlayer(sdt);
  updateMissiles(sdt);
  updateAsteroids(sdt);
  updateUfos(sdt);
  updateMines(sdt);
  updateHoles(sdt);
  updatePickups(sdt);
  updateCores(sdt);
  updateParts(sdt);

  const remain = Math.max(0, DURATION - S.t);
  const tel = document.getElementById('timer');
  tel.textContent = Math.floor(remain / 60) + ':' + String(Math.floor(remain % 60)).padStart(2, '0');
  tel.classList.toggle('danger', remain <= 15);
  renderHearts();

  if (engineGain) engineGain.gain.value = S.muted ? 0 : 0.028 + diff() * 0.012;

  if (remain <= 5.5 && remain > 0) {
    const c = Math.ceil(remain);
    if (update._c !== c) { update._c = c; tone(880, 0.12, 'square', 0.1); }
  }
}

function render(dt) {
  ctx.save();
  if (S.shake > 0) {
    ctx.translate(rand(-S.shake, S.shake) * 0.5, rand(-S.shake, S.shake) * 0.5);
    S.shake = Math.max(0, S.shake - dt * 40);
  }
  drawBackground(dt);
  for (const h of holes) drawHole(h);
  for (const m of mines) drawMine(m);
  for (const a of asteroids) drawAsteroid(a);
  for (const u of ufos) drawUfo(u);
  for (const p of pickups) drawPickup(p);
  drawCores();
  for (const b of bolts) {
    const X = sx(b.x), Y = sy(b.y);
    ctx.fillStyle = '#7dff9a';
    ctx.beginPath(); ctx.arc(X, Y, b.r, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(125,255,154,0.35)';
    ctx.beginPath(); ctx.arc(X, Y, b.r * 2, 0, TAU); ctx.fill();
  }
  for (const m of missiles) drawMissile(m);
  drawRocket();
  drawParts();
  ctx.restore();

  if (S.flash > 0) {
    ctx.fillStyle = 'rgba(255,70,70,' + S.flash * 0.9 + ')';
    ctx.fillRect(0, 0, W, H);
    S.flash -= dt;
  }
  if (S.slowmo > 0) {
    ctx.fillStyle = 'rgba(150,120,255,0.07)';
    ctx.fillRect(0, 0, W, H);
  }
  if (S.showFps) {
    ctx.fillStyle = 'rgba(160,200,255,0.85)';
    ctx.font = '12px monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText(Math.round(S.fps) + ' FPS · ' + S.q.toUpperCase(), W - 14, 58);
  }
}

function loop(now) {
  requestAnimationFrame(loop);
  const rawDt = Math.min((now - S.last) / 1000 || 0.016, 0.05);
  S.last = now;
  S.fps = lerp(S.fps, 1 / Math.max(rawDt, 0.0001), 0.06);
  if (S.mode === 'play') {
    if (S.hitStop > 0) { S.hitStop -= rawDt; render(0.0001); return; }
    update(rawDt);
    render(rawDt);
  } else if (S.mode === 'menu') {
    S.t += rawDt * 0.2;
    // gentle menu drift: camera pans so the starfield moves
    S.camX += rawDt * 30; S.camY += rawDt * 18;
    render(rawDt * 0.25);
  } else {
    render(0.0001);
  }
}

/* ================= flow ================= */

function startRun() {
  ensureAudio();
  resetRun();
  try {
    const n = (parseInt(localStorage.getItem('missileio_flights') || '0', 10) || 0) + 1;
    localStorage.setItem('missileio_flights', String(n));
  } catch (e) {}
  S.mode = 'play';
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('over').classList.add('hidden');
  document.getElementById('paused').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('menu-best').textContent =
    S.scoreBest > 0 ? 'BEST ' + S.scoreBest + ' · ' + fmtTime(S.bestTime) : '';
  document.getElementById('best').textContent = 'BEST ' + S.scoreBest;
  renderHearts();
  banner('SURVIVE 2:00', '#8fb8ff', 'HOLD LEFT / RIGHT TO STEER');
  showSteerHint(true);
  setTimeout(() => showSteerHint(false), 6000);
  if (engineGain) engineGain.gain.value = 0.03;
  startOnlineRun();
}

// Registers this run server-side so the leaderboard can validate the score.
// Fire-and-forget: if it fails (offline), the run simply stays local-only.
async function startOnlineRun() {
  FB.runId = null;
  if (!FB.ready || !FB.user) return;
  try {
    const ref = FB.F.doc(FB.F.collection(FB.db, 'runs'));
    await FB.F.setDoc(ref, {
      uid: FB.user.uid,
      startedAt: FB.F.serverTimestamp(),
      difficulty: S.diff,
    });
    FB.runId = ref.id;
  } catch (e) { FB.runId = null; }
}
function fmtTime(s) {
  s = Math.floor(s);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
function endRun(won) {
  if (S.mode !== 'play') return;
  S.mode = won ? 'win' : 'over';
  if (engineGain) engineGain.gain.value = 0;
  showSteerHint(false);
  const isBest = S.score > S.scoreBest;
  if (isBest) { S.scoreBest = S.score; localStorage.setItem('missileio_scorebest', String(S.score)); }
  if (S.t > S.bestTime) {
    S.bestTime = Math.min(S.t, DURATION);
    localStorage.setItem('missileio_besttime', String(S.bestTime));
  }
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('incoming').classList.add('hidden');
  const over = document.getElementById('over');
  over.classList.remove('hidden');
  over.querySelector('h2').textContent = won ? 'YOU SURVIVED!' : 'SHOT DOWN';
  over.querySelector('h2').className = won ? '' : 'dead';
  document.getElementById('final-score').textContent = S.score;
  document.getElementById('final-best').textContent = S.scoreBest;
  document.getElementById('final-wave').textContent = fmtTime(Math.min(S.t, DURATION));
  document.getElementById('final-kills').textContent = S.coresGot;
  document.getElementById('final-downed').textContent = S.dodged;
  document.getElementById('newbest').classList.toggle('hidden', !isBest);
  if (won) { sfx.win(); banner('2:00 — SURVIVED!', '#7ee2a8'); }
  handleSubmit();
}
function setPause(on) {
  if (S.mode !== 'play' && S.mode !== 'pause') return;
  S.mode = on ? 'pause' : 'play';
  document.getElementById('paused').classList.toggle('hidden', !on);
  if (engineGain) engineGain.gain.value = on || S.muted ? 0 : 0.03;
}
function togglePause() { setPause(S.mode === 'play'); }
function toMenu() {
  S.mode = 'menu';
  document.getElementById('over').classList.add('hidden');
  document.getElementById('paused').classList.add('hidden');
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('menu').classList.remove('hidden');
  showSteerHint(false);
  document.getElementById('menu-best').textContent =
    S.scoreBest > 0 ? 'BEST ' + S.scoreBest + ' · ' + fmtTime(S.bestTime) : 'NO FLIGHTS YET';
  if (engineGain) engineGain.gain.value = 0;
  loadBoard();
  if (window.__menuNav) window.__menuNav('home');
}

/* ================= backend: Firebase Google sign-in + leaderboard ================= */
const FB = { ready: false, tried: false, user: null, board: [], submitting: false };
const FB_CONFIG = {
  apiKey: 'AIzaSyAKkVod_ddUbgaNmD9mVX3YrgLdAwgtYCM',
  authDomain: 'studio-5006354319-33e06.firebaseapp.com',
  projectId: 'studio-5006354319-33e06',
  storageBucket: 'studio-5006354319-33e06.firebasestorage.app',
  messagingSenderId: '573713967819',
  appId: '1:573713967819:web:fe698d331bea09dcb9094e',
};
const FB_COLL = 'leaderboard';

function initBackend() {
  FB.tried = true;
  if (FB.ready || !window.Firebase) { paintAuth(); loadBoard(); return; }
  try {
    const F = window.Firebase;
    FB.F = F;
    FB.app = F.initializeApp(FB_CONFIG);
    FB.auth = F.getAuth(FB.app);
    FB.db = F.getFirestore(FB.app);
    FB.ready = true;
    // redirect flow is only the popup-blocked fallback now; still surface its errors
    F.getRedirectResult(FB.auth).catch(err => {
      if (err && err.code && err.code !== 'auth/no-auth-event')
        toast('Google sign-in failed: ' + friendlyAuthError(err.code));
    });
    F.onAuthStateChanged(FB.auth, user => {
      FB.user = user;
      paintAuth(); loadBoard();
    });
  } catch (e) { FB.ready = false; }
  paintAuth(); loadBoard();
}

function friendlyAuthError(code) {
  return {
    'auth/operation-not-allowed': 'Google sign-in is not enabled yet',
    'auth/unauthorized-domain': 'this domain is not authorized',
    'auth/popup-blocked': 'popup was blocked',
    'auth/cancelled-popup-request': 'sign-in was cancelled',
    'auth/network-request-failed': 'network error — check connection',
  }[code] || 'try again';
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const G_LOGO = '<svg viewBox="0 0 24 24"><path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.3H12v4.5h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.1.1 3.5 2.7.1.1c2.2-2 3.9-5 3.9-8.9z"/><path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.1 0-5.8-2.1-6.8-5l-.1.1-3.7 2.9v.1C3.5 21.3 7.4 24 12 24z"/><path fill="#FBBC05" d="M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4l-.1-.1-3.7-2.9-.1.1C.5 8.2 0 10 0 12s.5 3.8 1.3 5.4l3.9-3z"/><path fill="#EA4335" d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.4 0 3.5 2.7 1.3 6.6l3.9 3c1-2.9 3.7-4.9 6.8-4.9z"/></svg>';

function initialsAvatar(name) {
  const n = encodeURIComponent((name || 'P').trim().charAt(0).toUpperCase() || 'P');
  return 'https://ui-avatars.com/api/?name=' + n + '&background=243b8f&color=fff&size=96';
}

function paintAuth() {
  const el = document.getElementById('auth-area');
  if (!el) return;
  if (!FB.ready) return;
  if (FB.user) {
    el.innerHTML =
      '<div class="user-chip"><img src="' + esc(FB.user.photoURL || initialsAvatar(FB.user.displayName)) + '" alt=""><span>' +
      esc(FB.user.displayName || 'Pilot') + '</span>' +
      '<button id="btn-signout" class="mini-btn">Sign out</button></div>';
    document.getElementById('btn-signout').addEventListener('click', signOut);
  } else {
    el.innerHTML = '<button id="btn-signin" class="g-btn">' + G_LOGO + 'Sign in with Google</button>';
    document.getElementById('btn-signin').addEventListener('click', signInGoogle);
  }
  paintProfile();
}

// Profile page (navigation drawer). Mirrors auth state with a full card.
function paintProfile() {
  const card = document.getElementById('profile-card');
  if (!card) return;
  if (!FB.ready || !FB.user) {
    card.innerHTML =
      '<div class="profile-hero"><div class="profile-avatar anon">?</div>' +
      '<div class="profile-name">Guest pilot</div>' +
      '<div class="profile-email">Sign in to enter the leaderboard</div></div>' +
      '<button id="btn-signin-2" class="g-btn">' + G_LOGO + 'Sign in with Google</button>';
    const b = document.getElementById('btn-signin-2');
    if (b) b.addEventListener('click', signInGoogle);
    return;
  }
  const u = FB.user;
  card.innerHTML =
    '<div class="profile-hero"><img class="profile-avatar" src="' +
    esc(u.photoURL || initialsAvatar(u.displayName)) + '" alt="">' +
    '<div class="profile-name">' + esc(u.displayName || 'Pilot') + '</div>' +
    '<div class="profile-email">' + esc(u.email || '') + '</div></div>' +
    '<div class="profile-stats"><div><span>BEST</span><b>' + (S.scoreBest || 0) + '</b></div>' +
    '<div><span>FLIGHTS</span><b>' + (parseInt(localStorage.getItem('missileio_flights') || '0', 10) || 0) + '</b></div></div>' +
    '<button id="btn-signout-2" class="ghost-btn">Sign out</button>';
  document.getElementById('btn-signout-2').addEventListener('click', signOut);
}

function signInGoogle() {
  if (!FB.ready) { toast('Leaderboard is offline right now'); return; }
  const provider = new FB.F.GoogleAuthProvider();
  // Popup first: the game page never unloads, so the sign-in can't get lost
  // if the phone kills the background tab mid-flow (the redirect flow's
  // handshake lives in sessionStorage and dies with the tab).
  FB.F.signInWithPopup(FB.auth, provider).catch(err => {
    if (err.code === 'auth/popup-blocked') {
      // Fall back to redirect; getRedirectResult() in initBackend picks it up.
      FB.F.signInWithRedirect(FB.auth, provider).catch(e2 => {
        toast('Google sign-in failed: ' + friendlyAuthError(e2.code));
      });
    } else if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
      toast('Google sign-in failed: ' + friendlyAuthError(err.code));
    }
  });
}

async function signOut() {
  try { await FB.F.signOut(FB.auth); } catch (e) {}
  toast('Signed out');
}

async function loadBoard() {
  const el = document.getElementById('board-list');
  if (!el) return;
  if (!FB.ready) {
    el.innerHTML = '<div class="board-empty">' +
      (FB.tried ? 'Leaderboard is offline — check your connection.' : 'Loading…') + '</div>';
    return;
  }
  try {
    const snap = await FB.F.getDocs(FB.F.query(
      FB.F.collection(FB.db, FB_COLL),
      FB.F.orderBy('score', 'desc'),
      FB.F.limit(60)));
    const best = new Map();
    snap.forEach(doc => {
      const r = doc.data();
      const cur = best.get(r.userId);
      if (!cur || r.score > cur.score) best.set(r.userId, r);
    });
    FB.board = [...best.values()].sort((a, b) => b.score - a.score).slice(0, 10);
  } catch (e) { FB.board = []; }
  paintBoard();
}

function paintBoard() {
  const el = document.getElementById('board-list');
  if (!FB.board.length) {
    el.innerHTML = '<div class="board-empty">' +
      (FB.user ? 'No scores yet — be the first pilot on the board!' : 'Sign in with Google to enter the leaderboard.') +
      '</div>';
    return;
  }
  el.innerHTML = FB.board.map((r, i) => {
    const me = FB.user && r.userId === FB.user.uid;
    const rc = i === 0 ? 'r1' : i === 1 ? 'r2' : i === 2 ? 'r3' : '';
    return '<div class="board-row' + (me ? ' me' : '') + '">' +
      '<span class="rank ' + rc + '">' + (i + 1) + '</span>' +
      (r.avatar ? '<img class="avatar" src="' + esc(r.avatar) + '" alt="" loading="lazy">' : '') +
      '<span class="pname">' + esc(r.name || 'Pilot') + '</span>' +
      (r.difficulty ? '<span class="pdiff">' + esc(String(r.difficulty).toUpperCase()) + '</span>' : '') +
      '<span class="pscore">' + r.score + '</span></div>';
  }).join('');
}

async function submitScore() {
  if (!FB.ready || !FB.user || !FB.runId || S.score <= 0 || FB.submitting) return 'skip';
  FB.submitting = true;
  try {
    // Single-use doc id == run id: each run can only ever submit once.
    await FB.F.setDoc(FB.F.doc(FB.db, FB_COLL, FB.runId), {
      userId: FB.user.uid,
      runId: FB.runId,
      name: FB.user.displayName || 'Pilot',
      avatar: FB.user.photoURL || '',
      score: S.score,
      difficulty: S.diff,
      duration: Math.round(Math.min(S.t, DURATION) * 10) / 10,
      createdAt: FB.F.serverTimestamp(),
    });
    await loadBoard();
    const rank = FB.board.findIndex(r => r.userId === FB.user.uid);
    return rank >= 0 ? rank + 1 : null;
  } catch (e) { return 'error'; }
  finally { FB.submitting = false; }
}

async function handleSubmit() {
  const rankEl = document.getElementById('rank-line');
  rankEl.classList.add('hidden');
  if (!FB.ready) return;
  if (!FB.user) {
    rankEl.textContent = 'Sign in with Google to enter the leaderboard';
    rankEl.classList.remove('hidden');
    return;
  }
  if (!FB.runId) {
    rankEl.textContent = 'Online run could not start — score kept local';
    rankEl.classList.remove('hidden');
    return;
  }
  if (S.score <= 0) return;
  rankEl.textContent = 'Submitting score…';
  rankEl.classList.remove('hidden');
  const rank = await submitScore();
  if (rank === 'error') rankEl.textContent = 'Could not submit — offline?';
  else if (typeof rank === 'number') rankEl.textContent = 'RANK #' + rank + ' ON THE LEADERBOARD';
  else rankEl.classList.add('hidden');
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), 2600);
}

document.getElementById('btn-start').addEventListener('click', startRun);
document.getElementById('btn-retry').addEventListener('click', startRun);
document.getElementById('btn-resume').addEventListener('click', () => setPause(false));
document.getElementById('btn-quit').addEventListener('click', toMenu);
document.getElementById('btn-menu').addEventListener('click', toMenu);
document.getElementById('btn-refresh-board').addEventListener('click', () => { loadBoard(); toast('Leaderboard refreshed'); });
document.getElementById('btn-pause').addEventListener('click', () => togglePause());
document.getElementById('btn-mute').addEventListener('click', () => { ensureAudio(); toggleMute(); });
document.getElementById('btn-mute').style.opacity = S.muted ? 0.4 : 1;

function paintDiff() {
  document.querySelectorAll('.diff-btn').forEach(b =>
    b.classList.toggle('selected', b.dataset.diff === S.diff));
  document.getElementById('diff-note').textContent = DIFFS[S.diff].note;
}
document.querySelectorAll('.diff-btn').forEach(b =>
  b.addEventListener('click', () => {
    S.diff = b.dataset.diff;
    localStorage.setItem('missileio_diff', S.diff);
    ensureAudio(); tone(600, 0.08, 'square', 0.08);
    paintDiff();
  }));
paintDiff();

function paintQuality() {
  document.querySelectorAll('#seg-q button').forEach(b =>
    b.classList.toggle('selected', b.dataset.q === S.q));
  document.querySelectorAll('#seg-fps button').forEach(b =>
    b.classList.toggle('selected', (b.dataset.fps === '1') === S.showFps));
}
document.querySelectorAll('#seg-q button').forEach(b =>
  b.addEventListener('click', () => {
    S.q = b.dataset.q; localStorage.setItem('missileio_q', S.q);
    ensureAudio(); tone(600, 0.08, 'square', 0.08);
    resize(); initStars(); paintQuality();
  }));
document.querySelectorAll('#seg-fps button').forEach(b =>
  b.addEventListener('click', () => {
    S.showFps = b.dataset.fps === '1';
    localStorage.setItem('missileio_fps', S.showFps ? '1' : '0');
    ensureAudio(); tone(600, 0.08, 'square', 0.08);
    paintQuality();
  }));
paintQuality();

toMenu();
resize();
S.last = performance.now();
requestAnimationFrame(loop);

// Exported for lib/firebase-init.js and components/GameShell.jsx.
export { initBackend, signInGoogle, signOut };
