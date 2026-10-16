'use client';

import { useEffect, useRef, useState } from 'react';

// Material 3 outline-style icons (stroke = currentColor).
const Icon = ({ children }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true">{children}</svg>
);
const IconMenu = () => (<Icon><path d="M4 7h16M4 12h16M4 17h16" /></Icon>);
const IconHome = () => (<Icon><path d="M4 11l8-7 8 7" /><path d="M6.5 9.5V20h11V9.5" /></Icon>);
const IconPerson = () => (<Icon><circle cx="12" cy="8" r="3.6" /><path d="M4.8 20c1.6-3.6 4.2-5.2 7.2-5.2s5.6 1.6 7.2 5.2" /></Icon>);
const IconTune = () => (<Icon><path d="M4 8h16M4 16h16" /><circle cx="9.5" cy="8" r="2.4" fill="currentColor" stroke="none" /><circle cx="14.5" cy="16" r="2.4" fill="currentColor" stroke="none" /></Icon>);
const IconHelp = () => (<Icon><circle cx="12" cy="12" r="8.6" /><text x="12" y="16.6" textAnchor="middle" fontSize="12.5" fontWeight="700" fill="currentColor" stroke="none">?</text></Icon>);

const NAV = [
  { id: 'home', label: 'Play', Icon: IconHome },
  { id: 'profile', label: 'Profile', Icon: IconPerson },
  { id: 'settings', label: 'Settings', Icon: IconTune },
  { id: 'help', label: 'Help', Icon: IconHelp },
];

// Renders the exact DOM the game engine expects, then boots the engine
// client-side only. The engine (lib/game.js) touches the DOM at import
// time, so it is dynamically imported inside useEffect — never SSR'd.
// All engine-wired controls stay mounted (pages toggle via .hidden),
// because game.js binds its listeners once at import.
export default function GameShell() {
  const booted = useRef(false);
  const [drawer, setDrawer] = useState(false);
  const [page, setPage] = useState('home');

  useEffect(() => {
    // Lets the engine reset to the home page whenever it shows the menu.
    window.__menuNav = (p) => setPage(p);
    const onKey = (e) => { if (e.key === 'Escape') setDrawer(false); };
    window.addEventListener('keydown', onKey);
    if (!booted.current) {
      booted.current = true;
      (async () => {
        await import('../lib/game.js');
        await import('../lib/firebase-init.js');
      })();
    }
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (p) => { setPage(p); setDrawer(false); };

  return (
    <div id="wrap">
      <canvas id="game"></canvas>

      {/* HUD */}
      <div id="hud" className="hidden">
        <div id="hud-left">
          <div id="score">0 m</div>
          <div id="best">BEST 0 m</div>
        </div>
        <div id="hud-center">
          <div id="timer">2:00</div>
          <div id="incoming" className="hidden">INCOMING</div>
        </div>
        <div id="hud-right">
          <button id="btn-mute" className="icon-btn" title="Mute (M)">&#9836;</button>
          <button id="btn-pause" className="icon-btn" title="Pause (P)">II</button>
        </div>
        <div id="hull-wrap">
          <div id="hearts"></div>
          <div id="buffs"></div>
        </div>
      </div>

      <div id="wavebanner" className="hidden"></div>
      <div id="combo" className="hidden"></div>

      {/* touch steering zones */}
      <div id="steerhint" className="hidden">
        <div className="steer-zone left">&#9664;</div>
        <div className="steer-zone right">&#9654;</div>
      </div>

      {/* Main menu */}
      <div id="menu" className="overlay">
        <div className="panel menu-panel">
          <div className="menu-topbar">
            <button id="btn-drawer" className="m3-icon-btn" onClick={() => setDrawer(true)} aria-label="Open menu">
              <IconMenu />
            </button>
            <div id="auth-area"></div>
          </div>

          <div id="page-home" className={'menu-page' + (page === 'home' ? '' : ' hidden')}>
            <h1 className="logo">MISSILE<span>.IO</span></h1>
            <p className="tagline">Your rocket never stops. Survive 2 minutes in space.</p>
            <button id="btn-start" className="big-btn">LAUNCH</button>
            <div id="menu-best" className="best-line"></div>
            <div className="board-wrap">
              <div className="board-head"><span>TOP PILOTS</span><button id="btn-refresh-board" className="mini-btn" title="Refresh">&#8635;</button></div>
              <div id="board-list"><div className="board-empty">Loading…</div></div>
            </div>
          </div>

          <div id="page-profile" className={'menu-page' + (page === 'profile' ? '' : ' hidden')}>
            <h2 className="page-title">Profile</h2>
            <div id="profile-card" className="m3-card"></div>
          </div>

          <div id="page-settings" className={'menu-page' + (page === 'settings' ? '' : ' hidden')}>
            <h2 className="page-title">Settings</h2>
            <div className="set-group">
              <div className="set-group-label">DIFFICULTY</div>
              <div className="diff-row">
                <button className="diff-btn" data-diff="easy">EASY</button>
                <button className="diff-btn" data-diff="normal">NORMAL</button>
                <button className="diff-btn" data-diff="hard">HARD</button>
              </div>
              <p className="diff-note" id="diff-note"></p>
            </div>
            <div className="set-group">
              <div className="set-group-label">GRAPHICS</div>
              <div className="seg" id="seg-q">
                <button data-q="low">LOW</button><button data-q="med">MED</button><button data-q="high">HIGH</button>
              </div>
            </div>
            <div className="set-group">
              <div className="set-group-label">FPS METER</div>
              <div className="seg" id="seg-fps">
                <button data-fps="0">OFF</button><button data-fps="1">ON</button>
              </div>
            </div>
          </div>

          <div id="page-help" className={'menu-page' + (page === 'help' ? '' : ' hidden')}>
            <h2 className="page-title">How to play</h2>
            <div className="how">
              <div><b>&#9664; &#9654;</b> hold to turn — release to fly straight</div>
              <div><b>TOUCH</b> hold left / right half of the screen</div>
              <div><b>KEYS</b> &#8592; &#8594; or A / D &nbsp;·&nbsp; <b>PAUSE</b> P &nbsp;·&nbsp; <b>MUTE</b> M</div>
            </div>
            <p className="tip">Collect the glowing <b>cores</b> for score — chain them for streak bonuses. Homing missiles chase you: out-turn them, or lure them into asteroids.</p>
            <div className="how">
              <div><b>SHIELD</b> absorbs one hit &nbsp;·&nbsp; <b>HEART</b> repairs hull &nbsp;·&nbsp; <b>CLOCK</b> slows time</div>
              <div>Survive the full <b>2:00</b> to win. Sign in to post scores to TOP PILOTS.</div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation drawer (Material 3) */}
      <div id="drawer-scrim" className={drawer ? '' : 'hidden'} onClick={() => setDrawer(false)}></div>
      <nav id="drawer" className={drawer ? 'open' : ''} aria-hidden={!drawer} aria-label="Menu">
        <div className="drawer-head">
          <span className="logo-mini">MISSILE<span>.IO</span></span>
        </div>
        {NAV.map(({ id, label, Icon: ItemIcon }) => (
          <button key={id} className={'drawer-item' + (page === id ? ' active' : '')} onClick={() => go(id)}>
            <span className="drawer-icon"><ItemIcon /></span>
            <span className="drawer-label">{label}</span>
          </button>
        ))}
        <div className="drawer-foot">original game by Omdas11 · v1.0</div>
      </nav>

      {/* Pause */}
      <div id="paused" className="overlay hidden">
        <div className="panel">
          <h2>PAUSED</h2>
          <button id="btn-resume" className="big-btn">RESUME</button>
          <button id="btn-quit" className="ghost-btn">QUIT TO MENU</button>
        </div>
      </div>

      {/* Game over */}
      <div id="over" className="overlay hidden">
        <div className="panel">
          <h2 className="dead">SHOT DOWN</h2>
          <div className="stats">
            <div><span>SCORE</span><b id="final-score">0</b></div>
            <div><span>BEST</span><b id="final-best">0</b></div>
            <div><span>TIME</span><b id="final-wave">0:00</b></div>
            <div><span>CORES</span><b id="final-kills">0</b></div>
            <div><span>DODGED</span><b id="final-downed">0</b></div>
          </div>
          <div id="newbest" className="hidden">NEW BEST!</div>
          <div id="rank-line" className="rank-line hidden"></div>
          <button id="btn-retry" className="big-btn">FLY AGAIN</button>
          <button id="btn-menu" className="ghost-btn">MENU</button>
        </div>
      </div>
      <div id="toast" className="hidden"></div>
    </div>
  );
}
