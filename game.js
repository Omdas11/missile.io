'use strict';
/* ============================================================
   missile.io — 2-minutes-in-space style survival.
   Your rocket auto-flies upward. Steer. Dodge everything.
   Survive the full 2:00 to win.
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

let W = 0, H = 0;
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize); resize();

/* ---------- state ---------- */
const S = {
  mode: 'menu',                 // menu | play | pause | over | win
  t: 0, last: 0, timeScale: 1,
  dist: 0, speed: 260,          // px/s scroll speed, ramps slightly
  best: parseInt(localStorage.getItem('missileio_best') || '0', 10) || 0,
  bestTime: parseFloat(localStorage.getItem('missileio_besttime') || '0') || 0,
  dodged: 0, pickups: 0,
  shake: 0, hitStop: 0, flash: 0,
  muted: localStorage.getItem('missileio_mute') === '1',
  bannerAt: 0, slowmo: 0,
};

const player = {
  x: 0, y: 0, vx: 0, vy: 0, r: 13,
  hull: 100, maxHull: 100,
  alive: true, shield: 0, tilt: 0, flame: 0,
  invuln: 0,                          // brief grace after hit
};

let asteroids = [], missiles = [], bolts = [], mines = [], ufos = [], holes = [];
let pickups = [], parts = [], floaters = [], stars = [], speedlines = [];

function initSky() {
  stars = [];
  for (let i = 0; i < 140; i++)
    stars.push({ x: Math.random(), y: Math.random(), z: rand(0.2, 1), tw: rand(0, TAU) });
  speedlines = [];
  for (let i = 0; i < 24; i++)
    speedlines.push({ x: Math.random(), y: Math.random(), len: rand(30, 90), sp: rand(0.7, 1.3) });
}
initSky();

/* ---------- input ---------- */
const ptr = { x: innerWidth / 2, y: innerHeight * 0.72, active: false };
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  if (e.code === 'KeyM') toggleMute();
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e => keys[e.code] = false);
canvas.addEventListener('pointermove', e => { ptr.x = e.clientX; ptr.y = e.clientY; ptr.active = true; });
canvas.addEventListener('pointerdown', e => { ptr.x = e.clientX; ptr.y = e.clientY; ptr.active = true; ensureAudio(); });
canvas.addEventListener('touchmove', e => {
  const t = e.touches[0]; ptr.x = t.clientX; ptr.y = t.clientY; ptr.active = true; e.preventDefault();
}, { passive: false });
canvas.addEventListener('touchstart', e => {
  const t = e.touches[0]; ptr.x = t.clientX; ptr.y = t.clientY; ptr.active = true; ensureAudio(); e.preventDefault();
}, { passive: false });
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

/* ---------- fx helpers ---------- */
function explode(x, y, scale = 1, big = false) {
  const n = Math.floor((big ? 46 : 22) * scale);
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), sp = rand(30, big ? 320 : 220) * scale;
    puff(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.35, big ? 1.1 : 0.8),
      rand(1.5, big ? 5 : 3.5) * scale, Math.random() < 0.55 ? 'fire' : (Math.random() < 0.5 ? 'spark' : 'smoke'));
  }
  puff(x, y, 0, 0, 0.14, (big ? 46 : 26) * scale, 'flash');
  S.shake = Math.min(S.shake + (big ? 14 : 6) * scale, 22);
  big ? sfx.bigBoom() : sfx.boom();
}
function puff(x, y, vx, vy, life, r, kind) {
  if (parts.length > 900) return;
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

/* ---------- damage ---------- */
function damagePlayer(amount, sx, sy) {
  if (!player.alive || player.invuln > 0) return;
  if (player.shield > 0) {
    puff(player.x, player.y, rand(-80, 80), rand(-80, 80), 0.4, 3, 'spark');
    tone(300, 0.15, 'square', 0.09, 150);
    return;
  }
  player.hull -= amount;
  player.invuln = 0.8;
  explode(sx, sy, 0.7);
  sfx.hit();
  S.hitStop = 0.05; S.flash = 0.25;
  if (player.hull <= 0) {
    player.hull = 0; player.alive = false;
    explode(player.x, player.y, 1.7, true);
    setTimeout(() => endRun(false), 1000);
  }
  updateHUD();
}
function updateHUD() {
  const f = document.getElementById('hull-fill');
  const pct = clamp(player.hull / player.maxHull * 100, 0, 100);
  f.style.width = pct + '%';
  f.style.background = pct > 55 ? 'linear-gradient(90deg,#37e08b,#b6f34c)'
    : pct > 25 ? 'linear-gradient(90deg,#ffb02e,#ffd76a)' : 'linear-gradient(90deg,#ff5a5a,#ff8a5a)';
  document.getElementById('score').textContent = Math.floor(S.dist) + ' m';
}

/* ================= spawners & obstacles ================= */

function resetRun() {
  S.t = 0; S.dist = 0; S.speed = 260; S.timeScale = 1; S.slowmo = 0;
  S.dodged = 0; S.pickups = 0; S.shake = 0; S.hitStop = 0; S.flash = 0; S.bannerAt = 0;
  asteroids = []; missiles = []; bolts = []; mines = []; ufos = []; holes = [];
  pickups = []; parts = []; floaters = [];
  player.x = W / 2; player.y = H * 0.72; player.vx = 0; player.vy = 0;
  player.hull = player.maxHull; player.alive = true;
  player.shield = 0; player.tilt = 0; player.invuln = 1.2;
  spawnTimers.asteroid = 0.4; spawnTimers.missile = 8; spawnTimers.ufo = 14;
  spawnTimers.mine = 20; spawnTimers.hole = 40; spawnTimers.pickup = 6;
}
const spawnTimers = { asteroid: 0, missile: 0, ufo: 0, mine: 0, hole: 0, pickup: 0 };

/* difficulty 0..1 across the 2 minutes */
function diff() { return clamp(S.t / DURATION, 0, 1); }

function spawnDirector(dt) {
  const d = diff(), t = S.t;
  for (const k in spawnTimers) spawnTimers[k] -= dt;

  // asteroids — always, denser over time
  if (spawnTimers.asteroid <= 0) {
    spawnAsteroid();
    spawnTimers.asteroid = lerp(1.1, 0.32, d) * rand(0.6, 1.3);
    if (d > 0.5 && Math.random() < 0.4) spawnAsteroid();   // clusters late
  }
  // homing missiles — start ~15s, volleys late
  if (t > 12 && spawnTimers.missile <= 0) {
    const n = t > 100 ? 3 : (d > 0.55 ? 2 : 1);
    for (let i = 0; i < n; i++) setTimeout(spawnMissile, i * 350);
    spawnTimers.missile = lerp(7, 2.6, d) * rand(0.8, 1.2);
  }
  // UFOs — start ~25s, strafe and shoot
  if (t > 25 && spawnTimers.ufo <= 0) {
    spawnUfo();
    spawnTimers.ufo = lerp(11, 5, d) * rand(0.8, 1.3);
  }
  // mines — start ~40s
  if (t > 40 && spawnTimers.mine <= 0) {
    const n = randi(2, 4);
    for (let i = 0; i < n; i++) spawnMine(rand(40, W - 40), rand(-H * 0.4, -40));
    spawnTimers.mine = lerp(12, 6, d);
  }
  // black holes — start ~60s, rare
  if (t > 60 && spawnTimers.hole <= 0) {
    spawnHole();
    spawnTimers.hole = rand(14, 22);
  }
  // pickups — steady lifeline
  if (spawnTimers.pickup <= 0) {
    spawnPickup();
    spawnTimers.pickup = rand(9, 14);
  }

  // phase banners
  const marks = [
    [30, '30 SECONDS', '#8fb8ff'], [60, 'HALFWAY THERE', '#ffd76a'],
    [90, 'FINAL 30', '#ffb02e'], [110, 'MISSILE STORM', '#ff6b6b'],
  ];
  for (const [mt, txt, c] of marks)
    if (S.bannerAt < mt && t >= mt) { S.bannerAt = mt; banner(txt, c); tone(440, 0.2, 'triangle', 0.12); }
}

/* ----- asteroids ----- */
function spawnAsteroid(x, y) {
  const r = rand(12, 34 + diff() * 14);
  asteroids.push({
    x: x !== undefined ? x : rand(-20, W + 20), y: y !== undefined ? y : rand(-80, -30),
    vx: rand(-50, 50), vy: rand(40, 120),
    r, rot: rand(0, TAU), vr: rand(-1.5, 1.5),
    verts: Array.from({ length: 9 }, () => rand(0.72, 1.15)),
    hp: r > 26 ? 2 : 1,
  });
}
/* ----- homing missiles ----- */
function spawnMissile() {
  if (S.mode !== 'play' || !player.alive) return;
  const side = randi(0, 2);           // 0 top, 1 left, 2 right
  let x, y;
  if (side === 0) { x = rand(0, W); y = -30; }
  else if (side === 1) { x = -30; y = rand(0, H * 0.5); }
  else { x = W + 30; y = rand(0, H * 0.5); }
  const sp = rand(170, 210) + diff() * 90;
  const a = Math.atan2(player.y - y, player.x - x);
  missiles.push({
    x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
    r: 7, t: 0, life: rand(6, 8), speed: sp, turn: rand(2.4, 3.4) + diff(),
    warned: false,
  });
  sfx.launch();
}
/* ----- UFOs ----- */
function spawnUfo() {
  const fromLeft = Math.random() < 0.5;
  ufos.push({
    x: fromLeft ? -40 : W + 40, y: rand(H * 0.1, H * 0.4),
    vx: (fromLeft ? 1 : -1) * rand(90, 140), r: 18,
    t: 0, fireT: rand(0.8, 1.6), shots: randi(2, 3 + Math.floor(diff() * 3)),
    wob: rand(0, TAU),
  });
}
/* ----- mines ----- */
function spawnMine(x, y) {
  mines.push({ x, y, vy: rand(50, 90), r: 14, t: 0, armed: false, beepT: 0 });
}
/* ----- black holes ----- */
function spawnHole() {
  holes.push({ x: rand(80, W - 80), y: -60, vy: 55, r: 26, pull: 260, t: 0 });
}
/* ----- pickups ----- */
const PK = {
  S: { color: '#6db7ff', name: 'SHIELD' },
  H: { color: '#7ee2a8', name: 'REPAIR +35' },
  T: { color: '#c99aff', name: 'SLOW-MO' },
};
function spawnPickup() {
  const keys = ['S', 'H', 'T'];
  const k = player.hull < 45 && Math.random() < 0.5 ? 'H' : keys[randi(0, 2)];
  pickups.push({ x: rand(50, W - 50), y: -30, vy: 95, r: 14, t: 0, kind: k });
}
function applyPickup(p) {
  S.pickups++;
  sfx.pickup();
  puff(p.x, p.y, 0, 0, 0.4, 16, 'flash');
  floater(p.x, p.y - 20, PK[p.kind].name + '!', PK[p.kind].color);
  if (p.kind === 'S') player.shield = 9;
  else if (p.kind === 'H') { player.hull = Math.min(player.maxHull, player.hull + 35); }
  else if (p.kind === 'T') { S.slowmo = 4; }
  refreshBuffs(); updateHUD();
}
function refreshBuffs() {
  const el = document.getElementById('buffs');
  el.innerHTML = '';
  const add = (txt, warn) => {
    const s = document.createElement('span');
    s.className = 'buff' + (warn ? ' warn' : ''); s.textContent = txt; el.appendChild(s);
  };
  if (player.shield > 0) add('SHIELD ' + Math.ceil(player.shield) + 's');
  if (S.slowmo > 0) add('SLOW-MO ' + Math.ceil(S.slowmo) + 's');
}

/* ================= updates ================= */

function updatePlayer(dt) {
  // steer toward pointer
  const px = ptr.x, py = clamp(ptr.y, H * 0.25, H - 60);
  const k = 1 - Math.pow(0.0015, dt);            // framerate-independent lerp
  const nx = lerp(player.x, px, k), ny = lerp(player.y, py, k);
  player.vx = (nx - player.x) / Math.max(dt, 0.001);
  player.vy = (ny - player.y) / Math.max(dt, 0.001);
  player.x = nx; player.y = ny;

  // keyboard nudge
  const sp = 420;
  if (keys.KeyA || keys.ArrowLeft) player.x -= sp * dt;
  if (keys.KeyD || keys.ArrowRight) player.x += sp * dt;
  if (keys.KeyW || keys.ArrowUp) player.y -= sp * dt;
  if (keys.KeyS || keys.ArrowDown) player.y += sp * dt;
  player.x = clamp(player.x, 24, W - 24);
  player.y = clamp(player.y, H * 0.2, H - 50);

  player.tilt = clamp(player.vx / 900, -0.5, 0.5);
  player.flame = 0.6 + Math.random() * 0.4;
  if (player.shield > 0) player.shield -= dt;
  if (player.invuln > 0) player.invuln -= dt;

  // engine exhaust
  if (Math.random() < 0.6)
    puff(player.x + rand(-4, 4), player.y + 16, rand(-15, 15), rand(90, 160), rand(0.2, 0.4), rand(2, 4.5), 'fire');
  refreshBuffs();
}

function updateMissiles(dt) {
  let incoming = false;
  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i];
    m.t += dt; m.life -= dt;
    // homing steer
    const dx = player.x - m.x, dy = player.y - m.y, d = hyp(dx, dy) || 1;
    const desX = dx / d * m.speed, desY = dy / d * m.speed;
    const k = clamp(m.turn * dt, 0, 1);
    m.vx = lerp(m.vx, desX, k); m.vy = lerp(m.vy, desY, k);
    // normalize to speed
    const s = hyp(m.vx, m.vy) || 1;
    m.vx = m.vx / s * m.speed; m.vy = m.vy / s * m.speed;
    m.x += m.vx * dt; m.y += m.vy * dt;
    if (Math.random() < 0.85)
      puff(m.x, m.y, rand(-10, 10), rand(-10, 10), rand(0.3, 0.6), rand(2, 4), 'smoke');

    if (d < 280) { incoming = true; if (!m.warned) { m.warned = true; sfx.warn(); } }
    // hit player
    if (player.alive && d < m.r + player.r) {
      explode(m.x, m.y, 0.9);
      missiles.splice(i, 1);
      damagePlayer(25, m.x, m.y);
      continue;
    }
    // dodge credit when it burns out near-miss
    if (m.life <= 0 || m.x < -60 || m.x > W + 60 || m.y < -60 || m.y > H + 60) {
      if (d < 220) { S.dodged++; floater(m.x, m.y, 'DODGED!', '#8fb8ff'); }
      puff(m.x, m.y, 0, 0, 0.3, 8, 'smoke');
      missiles.splice(i, 1);
    }
  }
  document.getElementById('incoming').classList.toggle('hidden', !incoming);
}

function updateAsteroids(dt) {
  for (let i = asteroids.length - 1; i >= 0; i--) {
    const a = asteroids[i];
    a.x += a.vx * dt; a.y += (a.vy + S.speed * 0.55) * dt;
    a.rot += a.vr * dt;
    const d = hyp(player.x - a.x, player.y - a.y);
    if (player.alive && d < a.r * 0.85 + player.r) {
      explode(a.x, a.y, a.r / 22);
      asteroids.splice(i, 1);
      damagePlayer(Math.round(10 + a.r * 0.5), a.x, a.y);
      continue;
    }
    if (a.y > H + 80 || a.x < -80 || a.x > W + 80) {
      if (Math.abs(a.x - player.x) < 120) S.dodged++;
      asteroids.splice(i, 1);
    }
  }
}

function updateUfos(dt) {
  for (let i = ufos.length - 1; i >= 0; i--) {
    const u = ufos[i];
    u.t += dt; u.fireT -= dt;
    u.x += u.vx * dt;
    u.y += Math.sin(u.t * 2 + u.wob) * 30 * dt;
    if (u.fireT <= 0 && u.shots > 0 && u.x > 0 && u.x < W && player.alive) {
      u.shots--; u.fireT = rand(0.7, 1.3);
      const a = Math.atan2(player.y - u.y, player.x - u.x);
      const sp = 300 + diff() * 80;
      bolts.push({ x: u.x, y: u.y + 10, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 5, t: 0, life: 3 });
      sfx.zap();
      puff(u.x, u.y + 10, 0, 0, 0.15, 7, 'flash');
    }
    const d = hyp(player.x - u.x, player.y - u.y);
    if (player.alive && d < u.r + player.r) {
      explode(u.x, u.y, 1); ufos.splice(i, 1);
      damagePlayer(20, u.x, u.y); continue;
    }
    if (u.x < -80 || u.x > W + 80 || u.shots <= 0 && Math.abs(u.x - W / 2) > W) { ufos.splice(i, 1); }
    else if (u.shots <= 0 && (u.x < -60 || u.x > W + 60)) ufos.splice(i, 1);
  }
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i];
    b.t += dt; b.life -= dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    const d = hyp(player.x - b.x, player.y - b.y);
    if (player.alive && d < b.r + player.r) {
      puff(b.x, b.y, 0, 0, 0.2, 6, 'flash');
      bolts.splice(i, 1);
      damagePlayer(12, b.x, b.y); continue;
    }
    if (b.life <= 0 || b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) bolts.splice(i, 1);
  }
}

function updateMines(dt) {
  for (let i = mines.length - 1; i >= 0; i--) {
    const m = mines[i];
    m.t += dt; m.y += (m.vy + S.speed * 0.4) * dt;
    const d = hyp(player.x - m.x, player.y - m.y);
    if (!m.armed && d < 110) { m.armed = true; sfx.mine(); }
    if (m.armed) {
      m.beepT -= dt;
      if (m.beepT <= 0) { m.beepT = 0.28; tone(880, 0.06, 'square', 0.06); }
      if (d < 70) {   // proximity detonation
        explode(m.x, m.y, 1.4, true);
        mines.splice(i, 1);
        if (hyp(player.x - m.x, player.y - m.y) < 95) damagePlayer(35, m.x, m.y);
        continue;
      }
    }
    if (player.alive && d < m.r + player.r) {
      explode(m.x, m.y, 1.2, true);
      mines.splice(i, 1);
      damagePlayer(35, m.x, m.y); continue;
    }
    if (m.y > H + 60) mines.splice(i, 1);
  }
}

function updateHoles(dt) {
  for (let i = holes.length - 1; i >= 0; i--) {
    const h = holes[i];
    h.t += dt; h.y += (h.vy + S.speed * 0.3) * dt;
    const dx = h.x - player.x, dy = h.y - player.y, d = hyp(dx, dy) || 1;
    if (player.alive && d < 220) {   // gravitational pull
      const pull = h.pull * (1 - d / 220) * dt;
      player.x += dx / d * pull; player.y += dy / d * pull;
    }
    if (Math.random() < 0.5) {
      const a = rand(0, TAU), rr = rand(h.r * 1.2, h.r * 2.2);
      puff(h.x + Math.cos(a) * rr, h.y + Math.sin(a) * rr,
        -Math.cos(a) * 60, -Math.sin(a) * 60, 0.5, 2.5, 'spark');
    }
    if (player.alive && d < h.r + player.r) {
      explode(player.x, player.y, 1.2, true);
      damagePlayer(50, player.x, player.y);
    }
    if (h.y > H + 80) holes.splice(i, 1);
  }
}

function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.t += dt; p.y += (p.vy + S.speed * 0.35) * dt;
    p.x += Math.sin(p.t * 3) * 20 * dt;
    if (player.alive && hyp(player.x - p.x, player.y - p.y) < p.r + player.r + 4) {
      applyPickup(p);
      pickups.splice(i, 1); continue;
    }
    if (p.y > H + 40) pickups.splice(i, 1);
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

function drawBackground(dt) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  const d = diff();
  g.addColorStop(0, '#04060f'); g.addColorStop(0.55, '#0a1030'); g.addColorStop(1, '#1a0f2e');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // nebula blobs (static, subtle)
  ctx.save(); ctx.globalAlpha = 0.5;
  nebula('#243b8f', W * 0.2, H * 0.25, 190);
  nebula('#5b2a86', W * 0.85, H * 0.55, 230);
  nebula('#173a5e', W * 0.6, H * 0.85, 170);
  ctx.restore();

  // stars scroll downward = flying up
  for (const s of stars) {
    s.y += (0.12 + s.z * 0.5) * S.speed * dt / 260;
    if (s.y > 1) { s.y -= 1; s.x = Math.random(); }
    const tw = 0.45 + 0.55 * Math.abs(Math.sin(S.t * 2 + s.tw));
    ctx.globalAlpha = tw * s.z;
    ctx.fillStyle = '#cfe2ff';
    const r = s.z * 1.8;
    ctx.fillRect(s.x * W, s.y * H, r, r);
  }
  ctx.globalAlpha = 1;

  // speed lines
  ctx.strokeStyle = 'rgba(160,200,255,0.16)'; ctx.lineWidth = 1.5;
  for (const l of speedlines) {
    l.y += S.speed * l.sp * dt / H * 2.2;
    if (l.y > 1.15) { l.y = -0.15; l.x = Math.random(); }
    ctx.beginPath();
    ctx.moveTo(l.x * W, l.y * H);
    ctx.lineTo(l.x * W, l.y * H + l.len);
    ctx.stroke();
  }
}
function nebula(color, x, y, r) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color + '55'); g.addColorStop(1, color + '00');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function drawRocket() {
  if (!player.alive) return;
  ctx.save();
  ctx.translate(player.x, player.y);
  if (player.invuln > 0 && Math.floor(S.t * 12) % 2 === 0) ctx.globalAlpha = 0.35;
  ctx.rotate(player.tilt);

  // flame
  const fl = (14 + player.flame * 14);
  const fg = ctx.createLinearGradient(0, 14, 0, 14 + fl);
  fg.addColorStop(0, '#fff7cc'); fg.addColorStop(0.4, '#ffb02e'); fg.addColorStop(1, 'rgba(255,90,40,0)');
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.moveTo(-6, 14); ctx.lineTo(0, 14 + fl); ctx.lineTo(6, 14); ctx.closePath(); ctx.fill();

  // body
  ctx.fillStyle = '#dfe9ff';
  ctx.beginPath();
  ctx.moveTo(0, -20); ctx.lineTo(7, -4); ctx.lineTo(7, 12); ctx.lineTo(-7, 12); ctx.lineTo(-7, -4);
  ctx.closePath(); ctx.fill();
  // nose
  ctx.fillStyle = '#ff5a5a';
  ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(5, -8); ctx.lineTo(-5, -8); ctx.closePath(); ctx.fill();
  // cockpit
  ctx.fillStyle = '#274b8f';
  ctx.beginPath(); ctx.ellipse(0, -2, 3.4, 6, 0, 0, TAU); ctx.fill();
  // wings
  ctx.fillStyle = '#9db8e8';
  ctx.beginPath(); ctx.moveTo(-7, 2); ctx.lineTo(-17, 14); ctx.lineTo(-7, 12); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(7, 2); ctx.lineTo(17, 14); ctx.lineTo(7, 12); ctx.closePath(); ctx.fill();
  // fins
  ctx.fillStyle = '#ff5a5a';
  ctx.fillRect(-17, 11, 5, 3); ctx.fillRect(12, 11, 5, 3);

  // shield ring
  if (player.shield > 0) {
    ctx.strokeStyle = 'rgba(110,180,255,' + (0.5 + 0.3 * Math.sin(S.t * 8)) + ')';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 24, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}

function drawAsteroid(a) {
  ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.rot);
  ctx.fillStyle = '#5a4a42';
  ctx.strokeStyle = '#8a7568'; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < a.verts.length; i++) {
    const ang = i / a.verts.length * TAU, rr = a.r * a.verts[i];
    i ? ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr) : ctx.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.arc(-a.r * 0.25, -a.r * 0.2, a.r * 0.28, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawMissile(m) {
  const a = Math.atan2(m.vy, m.vx);
  ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(a);
  // body
  ctx.fillStyle = '#e8e8e8';
  ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(4, -4); ctx.lineTo(-8, -4); ctx.lineTo(-8, 4); ctx.lineTo(4, 4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ff5a5a'; ctx.fillRect(-8, -4, 4, 8);
  // flame
  const fl = 8 + Math.random() * 8;
  const fg = ctx.createLinearGradient(-12, 0, -12 - fl, 0);
  fg.addColorStop(0, '#fff7cc'); fg.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = fg;
  ctx.beginPath(); ctx.moveTo(-12, -3); ctx.lineTo(-12 - fl, 0); ctx.lineTo(-12, 3); ctx.closePath(); ctx.fill();
  // blinking tip
  if (Math.floor(S.t * 10) % 2 === 0) { ctx.fillStyle = '#ff3b3b'; ctx.beginPath(); ctx.arc(10, 0, 2.5, 0, TAU); ctx.fill(); }
  ctx.restore();
}

function drawUfo(u) {
  ctx.save(); ctx.translate(u.x, u.y);
  ctx.fillStyle = '#3ddc84';
  ctx.beginPath(); ctx.ellipse(0, 0, 18, 7, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#9ff5c4';
  ctx.beginPath(); ctx.ellipse(0, -5, 8, 6, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#063';
  for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(i * 7, 3, 2, 0, TAU); ctx.fill(); }
  ctx.restore();
}

function drawMine(m) {
  ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(m.t * 0.8);
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
  ctx.save(); ctx.translate(h.x, h.y);
  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, h.r * 2.4);
  g.addColorStop(0, '#000'); g.addColorStop(0.45, '#0a0a18');
  g.addColorStop(0.6, 'rgba(150,110,255,0.55)'); g.addColorStop(1, 'rgba(150,110,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, h.r * 2.4, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(190,150,255,0.7)'; ctx.lineWidth = 2;
  ctx.save(); ctx.rotate(h.t * 2);
  ctx.beginPath(); ctx.ellipse(0, 0, h.r * 1.5, h.r * 0.8, 0, 0, TAU); ctx.stroke();
  ctx.restore(); ctx.restore();
}

function drawPickup(p) {
  const d = PK[p.kind];
  ctx.save(); ctx.translate(p.x, p.y + Math.sin(p.t * 4) * 3);
  ctx.strokeStyle = d.color; ctx.lineWidth = 2.5;
  ctx.fillStyle = 'rgba(5,10,25,0.8)';
  ctx.beginPath(); ctx.arc(0, 0, p.r, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = d.color;
  ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(p.kind === 'H' ? '+' : p.kind, 0, 1);
  if (Math.floor(S.t * 3) % 2 === 0) {
    ctx.strokeStyle = d.color + '66';
    ctx.beginPath(); ctx.arc(0, 0, p.r + 5, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}

function drawParts() {
  for (const p of parts) {
    const k = 1 - p.t / p.life;
    if (p.kind === 'flash') {
      ctx.globalAlpha = k * 0.9;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, '#fff'); g.addColorStop(0.5, 'rgba(255,200,120,0.7)'); g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
    } else if (p.kind === 'fire') {
      ctx.globalAlpha = k;
      ctx.fillStyle = k > 0.5 ? '#ffd76a' : '#ff7a3c';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * k, 0, TAU); ctx.fill();
    } else if (p.kind === 'spark') {
      ctx.globalAlpha = k;
      ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke();
    } else { // smoke
      ctx.globalAlpha = k * 0.35;
      ctx.fillStyle = '#9aa4b8';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  for (const f of floaters) {
    const k = 1 - f.t / f.life;
    ctx.globalAlpha = k;
    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = f.color;
    ctx.fillText(f.txt, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

/* ================= main loop ================= */

function update(dt) {
  S.t += dt;
  S.speed = 260 + diff() * 90;
  S.dist += S.speed * dt / 34;                    // ~meters
  if (S.slowmo > 0) { S.slowmo -= dt; S.timeScale = 0.35; }
  else S.timeScale = lerp(S.timeScale, 1, dt * 4);
  const sdt = dt * S.timeScale;

  // win check
  if (S.t >= DURATION) { endRun(true); return; }

  spawnDirector(sdt);
  updatePlayer(sdt);
  updateMissiles(sdt);
  updateAsteroids(sdt);
  updateUfos(sdt);
  updateMines(sdt);
  updateHoles(sdt);
  updatePickups(sdt);
  updateParts(sdt);

  // timer HUD
  const remain = Math.max(0, DURATION - S.t);
  const mm = Math.floor(remain / 60), ss = Math.floor(remain % 60);
  const tel = document.getElementById('timer');
  tel.textContent = mm + ':' + String(ss).padStart(2, '0');
  tel.classList.toggle('danger', remain <= 15);
  updateHUD();

  if (engineGain) engineGain.gain.value = S.muted ? 0 : 0.028 + diff() * 0.012;

  // final countdown beeps
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
  for (const b of bolts) {
    ctx.fillStyle = '#7dff9a';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(125,255,154,0.35)';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 2, 0, TAU); ctx.fill();
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
}

function loop(now) {
  requestAnimationFrame(loop);
  const rawDt = Math.min((now - S.last) / 1000 || 0.016, 0.05);
  S.last = now;
  if (S.mode === 'play') {
    if (S.hitStop > 0) { S.hitStop -= rawDt; render(0.0001); return; }
    update(rawDt);
    render(rawDt);
  } else if (S.mode === 'menu') {
    S.t += rawDt * 0.25;
    render(rawDt * 0.25);
  } else {
    render(0.0001);   // frozen frame behind overlays
  }
}

/* ================= flow ================= */

function startRun() {
  ensureAudio();
  resetRun();
  S.mode = 'play';
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('over').classList.add('hidden');
  document.getElementById('paused').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('menu-best').textContent =
    S.best > 0 ? 'BEST ' + Math.floor(S.best) + ' m · ' + fmtTime(S.bestTime) : '';
  document.getElementById('best').textContent = 'BEST ' + Math.floor(S.best) + ' m';
  updateHUD();
  banner('SURVIVE 2:00', '#8fb8ff', 'DODGE EVERYTHING');
  if (engineGain) engineGain.gain.value = 0.03;
}
function fmtTime(s) {
  s = Math.floor(s);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
function endRun(won) {
  if (S.mode !== 'play') return;
  S.mode = won ? 'win' : 'over';
  if (engineGain) engineGain.gain.value = 0;
  const dist = Math.floor(S.dist);
  const isBest = dist > S.best;
  if (isBest) {
    S.best = dist;
    localStorage.setItem('missileio_best', String(dist));
  }
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
  document.getElementById('final-score').textContent = fmtTime(Math.min(S.t, DURATION));
  document.getElementById('final-best').textContent = dist + ' m';
  document.getElementById('final-wave').textContent = Math.floor(S.best) + ' m';
  document.getElementById('final-kills').textContent = S.dodged;
  document.getElementById('final-downed').textContent = S.pickups;
  document.getElementById('newbest').classList.toggle('hidden', !isBest);
  if (won) { sfx.win(); banner('2:00 — SURVIVED!', '#7ee2a8'); }
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
  document.getElementById('menu-best').textContent =
    S.best > 0 ? 'BEST ' + Math.floor(S.best) + ' m · ' + fmtTime(S.bestTime) : 'NO FLIGHTS YET';
  if (engineGain) engineGain.gain.value = 0;
}

document.getElementById('btn-start').addEventListener('click', startRun);
document.getElementById('btn-retry').addEventListener('click', startRun);
document.getElementById('btn-resume').addEventListener('click', () => setPause(false));
document.getElementById('btn-quit').addEventListener('click', toMenu);
document.getElementById('btn-menu').addEventListener('click', toMenu);
document.getElementById('btn-pause').addEventListener('click', () => togglePause());
document.getElementById('btn-mute').addEventListener('click', () => { ensureAudio(); toggleMute(); });
document.getElementById('btn-mute').style.opacity = S.muted ? 0.4 : 1;

toMenu();
S.last = performance.now();
requestAnimationFrame(loop);
