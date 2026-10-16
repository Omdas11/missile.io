'use client';

import { useEffect, useRef } from 'react';

// Renders the exact DOM the game engine expects, then boots the engine
// client-side only. The engine (lib/game.js) touches the DOM at import
// time, so it is dynamically imported inside useEffect — never SSR'd.
export default function GameShell() {
  const booted = useRef(false);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    (async () => {
      await import('../lib/game.js');
      await import('../lib/firebase-init.js');
    })();
  }, []);

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
        <div className="panel">
          <div id="auth-area"></div>
          <h1 className="logo">MISSILE<span>.IO</span></h1>
          <p className="tagline">Your rocket never stops. Survive 2 minutes in space.</p>
          <div className="how">
            <div><b>&#9664; &#9654;</b> hold to turn — release to fly straight</div>
            <div><b>TOUCH</b> hold left / right half of the screen</div>
            <div><b>KEYS</b> &#8592; &#8594; or A / D &nbsp;·&nbsp; <b>PAUSE</b> P &nbsp;·&nbsp; <b>MUTE</b> M</div>
          </div>
          <p className="tip">Collect the glowing <b>cores</b> for score — chain them for streak bonuses. Homing missiles chase you: out-turn them, or lure them into asteroids.</p>
          <div className="diff-row">
            <button className="diff-btn" data-diff="easy">EASY</button>
            <button className="diff-btn" data-diff="normal">NORMAL</button>
            <button className="diff-btn" data-diff="hard">HARD</button>
          </div>
          <p className="diff-note" id="diff-note"></p>
          <div className="set-row"><span className="set-label">GRAPHICS</span>
            <div className="seg" id="seg-q">
              <button data-q="low">LOW</button><button data-q="med">MED</button><button data-q="high">HIGH</button>
            </div>
          </div>
          <div className="set-row"><span className="set-label">FPS METER</span>
            <div className="seg" id="seg-fps">
              <button data-fps="0">OFF</button><button data-fps="1">ON</button>
            </div>
          </div>
          <button id="btn-start" className="big-btn">LAUNCH</button>
          <div id="menu-best" className="best-line"></div>

          <div className="board-wrap">
            <div className="board-head"><span>TOP PILOTS</span><button id="btn-refresh-board" className="mini-btn" title="Refresh">&#8635;</button></div>
            <div id="board-list"><div className="board-empty">Loading…</div></div>
          </div>
        </div>
      </div>

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
