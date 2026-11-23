/*
 * It's Just Solitaire — UI layer: card art, layout, input, animation.
 * All card artwork is original and generated here as SVG.
 */
(() => {
  'use strict';
  const E = window.SolitaireEngine;
  const Snd = window.SolitaireSound;

  const RED_INK = '#bf2f3a';
  const BLACK_INK = '#1c2533';
  const GOLD = '#c9952e';
  const SAVE_KEY = 'ijs.save.v1';
  const PREF_KEY = 'ijs.draw';
  const STATS_KEY = 'ijs.stats.v1';
  const SUIT_NAME = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };
  const RANK_NAME = ['', 'Ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King'];

  const $ = id => document.getElementById(id);
  const board = $('board');

  let S = null;            // engine state
  let history = [];        // undo snapshots
  let M = null;            // layout metrics
  const pos = [];          // current {x,y} per card id
  const zBase = [];
  const els = [];          // card elements
  let drag = null;
  let autoRunning = false;
  let celebrating = false;
  let stats = E.emptyStats();
  let lastBest = null;     // personal bests beaten by the latest win
  let statsMode = 1;       // tab shown in the stats sheet
  let hintIdx = 0, hintMoves = -1, hintTimer = 0;
  let toastTimer = 0;

  /* ================= Card artwork (original) ================= */

  const PIPS = {
    2: [[1, 0], [1, 1]],
    3: [[1, 0], [1, 0.5], [1, 1]],
    4: [[0, 0], [2, 0], [0, 1], [2, 1]],
    5: [[0, 0], [2, 0], [1, 0.5], [0, 1], [2, 1]],
    6: [[0, 0], [2, 0], [0, 0.5], [2, 0.5], [0, 1], [2, 1]],
    7: [[0, 0], [2, 0], [1, 0.25], [0, 0.5], [2, 0.5], [0, 1], [2, 1]],
    8: [[0, 0], [2, 0], [1, 0.25], [0, 0.5], [2, 0.5], [1, 0.75], [0, 1], [2, 1]],
    9: [[0, 0], [2, 0], [0, 1 / 3], [2, 1 / 3], [1, 0.5], [0, 2 / 3], [2, 2 / 3], [0, 1], [2, 1]],
    10: [[0, 0], [2, 0], [1, 1 / 6], [0, 1 / 3], [2, 1 / 3], [0, 2 / 3], [2, 2 / 3], [1, 5 / 6], [0, 1], [2, 1]],
  };

  const suitUse = (s, x, y, size, col, extra = '') =>
    `<use href="#s-${s}" x="${x}" y="${y}" width="${size}" height="${size}" fill="${col}" ${extra}/>`;

  function courtArt(rank, s, col) {
    let art = '';
    if (rank === 13) { // crown
      art = `<path d="M28 86 L24 58 L38 70 L50 50 L62 70 L76 58 L72 86 Z" fill="${col}"/>
        <rect x="27" y="82" width="46" height="7" rx="1.5" fill="${GOLD}"/>
        <circle cx="24" cy="56" r="3.5" fill="${GOLD}"/><circle cx="50" cy="48" r="4" fill="${GOLD}"/>
        <circle cx="76" cy="56" r="3.5" fill="${GOLD}"/>`;
    } else if (rank === 12) { // tiara
      art = `<path d="M26 88 Q50 78 74 88 L71 74 Q50 64 29 74 Z" fill="${col}"/>
        <path d="M30 72 L35 58 L42 68 L50 50 L58 68 L65 58 L70 72" fill="none" stroke="${col}" stroke-width="3" stroke-linejoin="round"/>
        <circle cx="35" cy="57" r="3" fill="${GOLD}"/><circle cx="50" cy="49" r="4.5" fill="${GOLD}"/>
        <circle cx="65" cy="57" r="3" fill="${GOLD}"/><circle cx="50" cy="80" r="3" fill="${GOLD}"/>`;
    } else { // shield
      art = `<path d="M32 50 H68 V68 Q68 84 50 92 Q32 84 32 68 Z" fill="${col}"/>
        <path d="M39 61 L50 70 L61 61" fill="none" stroke="${GOLD}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M41 72 L50 79 L59 72" fill="none" stroke="${GOLD}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    return `<rect x="16" y="38" width="68" height="94" rx="6" fill="${col}" fill-opacity=".07" stroke="${col}" stroke-width="1.4"/>
      <rect x="20" y="42" width="60" height="86" rx="4" fill="none" stroke="${GOLD}" stroke-width=".8"/>
      ${art}${suitUse(s, 38, 97, 24, col)}`;
  }

  function frontSVG(id) {
    const s = E.suitOf(id), r = E.rankOf(id);
    const col = E.isRed(id) ? RED_INK : BLACK_INK;
    const label = E.LABELS[r];
    let body = '';
    if (r === 1) {
      body = `<circle cx="50" cy="86" r="33" fill="none" stroke="${GOLD}" stroke-width="1.5"/>
        <circle cx="50" cy="86" r="28" fill="none" stroke="${GOLD}" stroke-width=".9" stroke-dasharray="2 3"/>
        ${suitUse(s, 28, 64, 44, col)}`;
    } else if (r <= 10) {
      const xs = [27, 50, 73];
      body = PIPS[r].map(([c, t]) => {
        const cx = xs[c], cy = 50 + t * 68, sz = 19;
        const flip = t > 0.5 ? `transform="rotate(180 ${cx} ${cy})"` : '';
        return suitUse(s, cx - sz / 2, cy - sz / 2, sz, col, flip);
      }).join('');
    } else {
      body = courtArt(r, s, col);
    }
    return `<svg viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <text x="6" y="31" font-size="${label === '10' ? 27 : 32}" font-weight="700" fill="${col}"
        font-family="Georgia, 'Times New Roman', serif" letter-spacing="-2">${label}</text>
      ${suitUse(s, 69, 6, 25, col)}${body}</svg>`;
  }

  function installCardBack() {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 140'>
      <defs><pattern id='p' width='9' height='9' patternUnits='userSpaceOnUse' patternTransform='rotate(45)'>
        <rect width='9' height='9' fill='#7a2e3a'/><path d='M0 4.5H9M4.5 0V9' stroke='#94404d' stroke-width='1.3'/>
        <circle cx='4.5' cy='4.5' r='1.1' fill='#b8616b'/></pattern></defs>
      <rect width='100' height='140' fill='#f3ead8'/>
      <rect x='5' y='5' width='90' height='130' rx='5' fill='url(#p)'/>
      <rect x='9' y='9' width='82' height='122' rx='3' fill='none' stroke='#e3b456' stroke-width='1.2'/>
      <g transform='translate(50 70)'>
        <circle r='17' fill='#7a2e3a' stroke='#e3b456' stroke-width='1.2'/>
        <path d='M0 -14 L3.5 -3.5 L14 0 L3.5 3.5 L0 14 L-3.5 3.5 L-14 0 L-3.5 -3.5Z' fill='#e3b456'/>
        <circle r='2.6' fill='#7a2e3a'/></g></svg>`;
    document.documentElement.style.setProperty('--back',
      `url("data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, ' '))}")`);
  }

  /* ================= DOM setup ================= */

  const slots = { stock: null, foundations: [], tableau: [] };

  function makeSlot(cls, text = '') {
    const el = document.createElement('div');
    el.className = 'slot ' + cls;
    el.innerHTML = text;
    board.appendChild(el);
    return el;
  }

  function buildDOM() {
    installCardBack();
    slots.stock = makeSlot('slot-stock',
      '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/></svg>');
    slots.waste = makeSlot('slot-waste');
    for (let i = 0; i < 4; i++) slots.foundations.push(makeSlot('slot-foundation', 'A'));
    for (let i = 0; i < 7; i++) slots.tableau.push(makeSlot('slot-tableau', 'K'));
    for (let id = 0; id < 52; id++) {
      const el = document.createElement('div');
      el.className = 'card facedown';
      el.dataset.id = id;
      el.setAttribute('aria-label', `${RANK_NAME[E.rankOf(id)]} of ${SUIT_NAME[E.suitOf(id)]}`);
      el.innerHTML = `<div class="inner"><div class="face front">${frontSVG(id)}</div><div class="face back"></div></div>`;
      board.appendChild(el);
      els[id] = el;
    }
  }

  /* ================= Layout ================= */

  const MIN_UP = 0.24; // face-up overlap that keeps the corner rank readable (x card height)
  const MIN_DOWN = 0.05;

  /** Largest card height that lets every column fan out readably (Infinity if no limit). */
  function columnFitCh() {
    if (!S || !M) return Infinity;
    const room = M.H - M.top - 2.6 * M.gap;
    let cap = Infinity;
    S.tableau.forEach(p => {
      if (p.length < 2) return;
      const d = p.slice(0, -1).filter(id => !S.up[id]).length;
      const u = p.length - 1 - d;
      cap = Math.min(cap, room / (2 + MIN_DOWN * d + MIN_UP * u));
    });
    return Math.floor(cap);
  }

  function computeMetrics(maxCh = Infinity) {
    const W = board.clientWidth, H = board.clientHeight;
    const wide = W > H * 1.3; // landscape: height is the limit
    const gap = Math.max(4, Math.min(14, W * 0.018, H * 0.025));
    // Height must fit the top row plus room for long columns to fan downward
    const rows = wide ? 3.7 : 3.3;
    let cw = (W - gap * 8) / 7;
    cw = Math.floor(Math.min(cw, 112, (H - gap * 3) / (1.4 * rows), maxCh / 1.4));
    const ch = Math.round(cw * 1.4);
    const left = Math.round((W - (cw * 7 + gap * 6)) / 2);
    const top = Math.round(gap);
    M = {
      W, H, gap, cw, ch, top, maxCh,
      x: i => left + i * (cw + gap),
      tabY: Math.round(top + ch + gap * 1.6),
    };
    document.documentElement.style.setProperty('--cw', cw + 'px');
    document.documentElement.style.setProperty('--ch', ch + 'px');
  }

  function setSlot(el, x, y) { el.style.transform = `translate3d(${x}px,${y}px,0)`; }

  function layout(opts = {}) {
    // Shrink cards slightly while a very long column needs the room; grow back after
    const fit = columnFitCh();
    if (fit !== M.maxCh) computeMetrics(fit);
    const { cw, ch, x, top, tabY, H, gap } = M;
    const lifted = new Set(opts.lifted || []);
    const delays = opts.delays || {};
    const flipDelays = opts.flipDelays || {};

    const place = (id, px, py, z) => {
      const el = els[id];
      pos[id] = { x: px, y: py };
      zBase[id] = z;
      el.style.transitionDelay = delays[id] ? delays[id] + 'ms' : '';
      el.firstChild.style.transitionDelay = flipDelays[id] ? flipDelays[id] + 'ms' : '';
      el.style.transform = `translate3d(${px}px,${py}px,0)`;
      el.style.zIndex = lifted.has(id) ? 1000 + z : z;
      el.classList.toggle('facedown', !S.up[id]);
    };

    setSlot(slots.stock, x(0), top);
    setSlot(slots.waste, x(1), top);
    slots.waste.style.visibility = 'hidden';
    slots.stock.classList.toggle('can-recycle', !S.stock.length && S.waste.length > 0);
    slots.foundations.forEach((el, i) => setSlot(el, x(3 + i), top));
    slots.tableau.forEach((el, i) => setSlot(el, x(i), tabY));

    // Stock: tiny offset every few cards to suggest thickness
    S.stock.forEach((id, i) => place(id, x(0) - Math.floor(i / 8), top - Math.floor(i / 8), 10 + i));

    const wl = S.waste.length;
    const fan = S.drawCount === 3 ? Math.min(3, wl) : 1;
    S.waste.forEach((id, i) => {
      const k = i - (wl - fan);
      place(id, x(1) + (k > 0 ? Math.round(k * cw * 0.36) : 0), top, 10 + i);
    });

    S.foundations.forEach((p, fi) => p.forEach((id, i) => place(id, x(3 + fi), top, 10 + i)));

    const avail = H - tabY - gap;
    S.tableau.forEach((p, ti) => {
      let down = ch * 0.11, up = ch * 0.28;
      const gapsDown = p.slice(0, -1).filter(id => !S.up[id]).length;
      const gapsUp = Math.max(0, p.length - 1 - gapsDown);
      if (gapsUp && gapsDown * down + gapsUp * up + ch > avail) {
        up = Math.max(ch * MIN_UP, (avail - ch - gapsDown * down) / gapsUp);
      }
      if (gapsDown && gapsDown * down + gapsUp * up + ch > avail) {
        down = Math.max(ch * MIN_DOWN, (avail - ch - gapsUp * up) / gapsDown);
      }
      // Last resort for very long columns: squeeze face-up cards so nothing goes off screen
      if (gapsUp && gapsDown * down + gapsUp * up + ch > avail) {
        up = Math.max(2, (avail - ch - gapsDown * down) / gapsUp);
      }
      let y = tabY;
      p.forEach((id, i) => {
        place(id, x(ti), Math.round(y), 10 + i);
        y += S.up[id] ? up : down;
      });
    });

    if (lifted.size) {
      const wait = Math.max(0, ...Object.values(delays)) + 380;
      setTimeout(() => lifted.forEach(id => {
        if (!drag || !drag.ids.includes(id)) els[id].style.zIndex = zBase[id];
      }), wait);
    }
  }

  function snapLayout() {
    board.classList.add('notrans');
    els.forEach(el => el.classList.add('notrans'));
    layout();
    void board.offsetWidth;
    els.forEach(el => el.classList.remove('notrans'));
    board.classList.remove('notrans');
  }

  /* ================= Game flow ================= */

  function locKey(id) {
    const l = E.locate(S, id);
    return l.type + l.index + ':' + l.pos + (S.up[id] ? 'u' : 'd');
  }

  function commit(lifted, extra = {}) {
    clearHint();
    layout({ lifted, ...extra });
    trackStats();
    updateUI();
    save();
    if (S.won && !celebrating) setTimeout(celebrate, 450);
  }

  /* ================= Stats ================= */

  function trackStats() {
    let changed = false;
    if (S.started && !S.counted) {
      S.counted = true;
      E.statsGameStarted(stats, S.drawCount);
      changed = true;
    }
    if (S.won && !S.recorded) {
      S.recorded = true;
      lastBest = E.statsGameWon(stats, S.drawCount, E.displayScore(S), S.elapsed, S.moves);
      changed = true;
    }
    if (changed) saveStats();
  }

  function saveStats() {
    try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (e) { /* ignore */ }
  }

  function loadStats() {
    try { stats = E.normalizeStats(JSON.parse(localStorage.getItem(STATS_KEY))); } catch (e) { stats = E.emptyStats(); }
  }

  function renderStats() {
    const s = stats[statsMode];
    document.querySelectorAll('[data-stats-mode]').forEach(b =>
      b.setAttribute('aria-selected', String(+b.dataset.statsMode === statsMode)));
    $('st-played').textContent = s.played;
    $('st-won').textContent = s.won;
    $('st-rate').textContent = s.played ? Math.round((s.won / s.played) * 100) + '%' : '–';
    $('st-streak').textContent = s.streak;
    $('st-best-streak').textContent = s.bestStreak;
    $('st-best-score').textContent = s.won ? s.bestScore.toLocaleString() : '–';
    $('st-best-time').textContent = s.won ? fmtTime(s.bestTime) : '–';
    $('st-fewest').textContent = s.won ? s.fewestMoves : '–';
    const reset = $('btn-reset-stats');
    reset.textContent = 'Reset stats';
    reset.dataset.armed = '';
  }

  function openStats() {
    statsMode = S.drawCount;
    renderStats();
    openModal('modal-stats');
  }

  function resetStats() {
    const btn = $('btn-reset-stats');
    if (!btn.dataset.armed) {
      btn.dataset.armed = '1';
      btn.textContent = 'Tap again to reset ' + 'Draw ' + statsMode;
      return;
    }
    stats[statsMode] = E.emptyStats()[statsMode];
    saveStats();
    renderStats();
  }

  /* ================= Hints ================= */

  function clearHint() {
    clearTimeout(hintTimer);
    board.querySelectorAll('.hint, .hint-dst').forEach(el => el.classList.remove('hint', 'hint-dst'));
  }

  function showToast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function pileTopEl(type, index) {
    const pile = E.getPile(S, type, index);
    if (pile.length) return els[pile[pile.length - 1]];
    if (type === 'foundation') return slots.foundations[index];
    if (type === 'tableau') return slots.tableau[index];
    return slots.stock;
  }

  function showHint() {
    if (S.won || autoRunning || drag) return;
    clearHint();
    const hints = E.findHints(S);
    if (!hints.length) {
      Snd.play('invalid');
      showToast(E.canAutoFinish(S) ? 'Tap Auto Finish to wrap it up.' : 'No useful moves left. Try Undo or start a new game.');
      return;
    }
    if (hintMoves !== S.moves) { hintIdx = 0; hintMoves = S.moves; }
    const h = hints[hintIdx % hints.length];
    hintIdx++;
    Snd.play('hint');
    if (h.kind === 'stock') {
      pileTopEl('stock', 0).classList.add('hint');
      if (hints.length === 1) showToast(S.stock.length ? 'Turn over the stock.' : 'Flip the waste back over to the stock.');
    } else {
      h.ids.forEach(id => els[id].classList.add('hint'));
      pileTopEl(h.type, h.index).classList.add('hint-dst');
    }
    hintTimer = setTimeout(clearHint, 1800);
  }

  function pushHistory() {
    history.push(E.snapshot(S));
    if (history.length > 400) history.shift();
  }

  function doMove(loc, type, index) {
    pushHistory();
    const moving = E.getPile(S, loc.type, loc.index).length - loc.pos;
    const firstId = E.getPile(S, loc.type, loc.index)[loc.pos];
    const changed = E.move(S, loc, type, index);
    if (type === 'foundation') Snd.play('foundation', { rank: E.rankOf(firstId) });
    else Snd.play('place');
    if (changed.length > moving) setTimeout(() => Snd.play('flip'), 140); // revealed a card
    commit(changed);
  }

  function drawStock() {
    if (!S.stock.length && !S.waste.length) return;
    pushHistory();
    const res = E.draw(S);
    if (res.recycled) Snd.play('recycle');
    else Snd.play('draw', { count: res.ids.length });
    const delays = {};
    if (!res.recycled) res.ids.forEach((id, i) => { delays[id] = i * 70; });
    commit(res.ids, { delays });
  }

  function tapCard(id) {
    const target = E.autoTarget(S, id);
    if (target) doMove(target.loc, target.type, target.index);
    else nope(id);
  }

  function nope(id) {
    Snd.play('invalid');
    const el = els[id];
    el.classList.remove('nope');
    void el.offsetWidth;
    el.classList.add('nope');
    setTimeout(() => el.classList.remove('nope'), 350);
  }

  function undo() {
    if (!history.length || S.won || autoRunning) return;
    const before = els.map((_, id) => locKey(id));
    E.restore(S, history.pop());
    Snd.play('undo');
    const changed = [];
    els.forEach((_, id) => { if (locKey(id) !== before[id]) changed.push(id); });
    commit(changed);
  }

  function autoFinish() {
    if (autoRunning || !E.canAutoFinish(S)) return;
    autoRunning = true;
    updateUI();
    const step = () => {
      const m = !S.won && E.nextFinishMove(S);
      if (!m) { autoRunning = false; updateUI(); return; }
      doMove(m.loc, m.type, m.index);
      setTimeout(step, 110);
    };
    step();
  }

  function startNewGame(drawCount) {
    try { localStorage.setItem(PREF_KEY, String(drawCount)); } catch (e) { /* ignore */ }
    // Walking away from a game in progress counts as a loss for streaks
    if (S && S.counted && !S.won) {
      E.statsGameLost(stats, S.drawCount);
      saveStats();
    }
    lastBest = null;
    clearHint();
    const { state, dealOrder } = E.newGame(drawCount);
    S = state;
    history = [];
    autoRunning = false;
    celebrating = false;
    closeModals();

    // Gather every card onto the stock spot, face down, without animation
    els.forEach((el, id) => {
      el.style.transition = '';
      el.classList.add('notrans', 'facedown');
      el.style.transitionDelay = '';
      el.firstChild.style.transitionDelay = '';
      el.style.transform = `translate3d(${M.x(0)}px,${M.top}px,0)`;
      el.style.zIndex = 10;
    });
    void board.offsetWidth;
    els.forEach(el => el.classList.remove('notrans'));

    // Deal with a stagger, then flip the top card of each column
    const delays = {}, flipDelays = {};
    dealOrder.forEach((id, i) => {
      delays[id] = i * 45;
      if (S.up[id]) flipDelays[id] = i * 45 + 220;
    });
    Snd.play('shuffle');
    Snd.play('deal', { times: dealOrder.map((_, i) => 320 + i * 45) });
    commit(dealOrder, { delays, flipDelays });
  }

  function celebrate() {
    celebrating = true;
    updateUI();
    Snd.play('win');
    const { W, H, cw, ch } = M;
    const ids = S.foundations.flat().reverse();
    ids.forEach((id, i) => {
      const el = els[id];
      setTimeout(() => {
        const tx = Math.random() * (W - cw);
        const ty = Math.random() * (H - ch);
        const rot = Math.round(Math.random() * 720 - 360);
        el.style.transition = 'transform 1.1s cubic-bezier(.15,.75,.25,1)';
        el.style.zIndex = 2000 + i;
        el.style.transform = `translate3d(${tx}px,${ty}px,0) rotate(${rot}deg)`;
      }, i * 28);
    });
    setTimeout(showWin, ids.length * 28 + 900);
  }

  /* ================= Input ================= */

  function onDown(e) {
    if (drag || autoRunning || S.won) return;
    if (e.button !== undefined && e.button !== 0) return;
    const cardEl = e.target.closest('.card');
    if (!cardEl) {
      if (e.target.closest('.slot-stock')) drawStock();
      return;
    }
    const id = +cardEl.dataset.id;
    const loc = E.locate(S, id);
    if (loc.type === 'stock') { drawStock(); return; }
    const pick = E.pickable(S, id);
    if (!pick) return;
    e.preventDefault();
    drag = { id, ids: pick.ids, loc: pick.loc, sx: e.clientX, sy: e.clientY, dx: 0, dy: 0, moved: false, pid: e.pointerId };
  }

  function onMove(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    drag.dx = e.clientX - drag.sx;
    drag.dy = e.clientY - drag.sy;
    if (!drag.moved) {
      if (Math.hypot(drag.dx, drag.dy) < 7) return;
      drag.moved = true;
      Snd.play('pick');
      drag.ids.forEach((id, i) => {
        const el = els[id];
        el.classList.add('dragging');
        el.style.transitionDelay = '';
        el.style.zIndex = 3000 + i;
      });
    }
    drag.ids.forEach(id => {
      els[id].style.transform = `translate3d(${pos[id].x + drag.dx}px,${pos[id].y + drag.dy}px,0)`;
    });
  }

  function overlap(a, b) {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
  }

  function findDrop(d) {
    const { cw, ch, x, top, tabY } = M;
    const p0 = pos[d.ids[0]];
    const r = { x: p0.x + d.dx, y: p0.y + d.dy, w: cw, h: ch };
    let best = null, bestA = 0;
    const consider = (type, index, rect) => {
      if (!E.isLegal(S, d.loc, d.ids, type, index)) return;
      const a = overlap(r, rect);
      if (a > bestA) { bestA = a; best = { type, index }; }
    };
    for (let fi = 0; fi < 4; fi++) consider('foundation', fi, { x: x(3 + fi), y: top, w: cw, h: ch });
    for (let ti = 0; ti < 7; ti++) {
      const p = S.tableau[ti];
      const ty = p.length ? pos[p[p.length - 1]].y : tabY;
      consider('tableau', ti, { x: x(ti), y: ty, w: cw, h: ch * 1.4 });
    }
    return best;
  }

  function onUp(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    const d = drag;
    drag = null;
    if (!d.moved) { tapCard(d.id); return; }
    d.ids.forEach(id => els[id].classList.remove('dragging'));
    const target = findDrop(d);
    if (target) doMove(d.loc, target.type, target.index);
    else { Snd.play('invalid'); layout({ lifted: d.ids }); }
  }

  function onCancel(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    const d = drag;
    drag = null;
    d.ids.forEach(id => els[id].classList.remove('dragging'));
    layout({ lifted: d.ids });
  }

  /* ================= UI chrome ================= */

  function fmtTime(sec) {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
  }

  function updateUI() {
    $('score').textContent = E.displayScore(S);
    $('time').textContent = fmtTime(S.elapsed);
    $('moves').textContent = S.moves;
    $('mode-label').textContent = 'Draw ' + S.drawCount;
    $('btn-undo').disabled = !history.length || S.won || autoRunning;
    $('btn-hint').disabled = S.won || autoRunning;
    $('btn-auto').hidden = !E.canAutoFinish(S) || autoRunning;
  }

  function openModal(id) { closeModals(); $(id).hidden = false; }
  function closeModals() { document.querySelectorAll('.modal').forEach(m => { m.hidden = true; }); }

  function openNewGame() {
    document.querySelectorAll('#modal-new .choice').forEach(b => {
      b.classList.toggle('current', +b.dataset.draw === S.drawCount);
    });
    openModal('modal-new');
  }

  function showWin() {
    $('win-score').textContent = E.displayScore(S);
    $('win-time').textContent = fmtTime(S.elapsed);
    $('win-moves').textContent = S.moves;
    $('win-bonus').textContent = S.bonus ? `Includes a ${S.bonus.toLocaleString()} point time bonus` : '';
    $('again-mode').textContent = 'Draw ' + S.drawCount;
    const beat = [];
    if (lastBest) {
      if (lastBest.score) beat.push('best score');
      if (lastBest.time) beat.push('fastest time');
      if (lastBest.moves) beat.push('fewest moves');
    }
    const st = stats[S.drawCount];
    $('win-best').textContent = beat.length
      ? 'New ' + beat.join(', ') + '!'
      : (st.streak > 1 ? st.streak + ' wins in a row!' : '');
    openModal('modal-win');
  }

  /* ================= Persistence ================= */

  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ state: S, history: history.slice(-150) }));
    } catch (e) { /* storage unavailable */ }
  }

  function load() {
    try {
      const o = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (o && o.state && !o.state.won && E.isValidState(o.state)) return o;
    } catch (e) { /* ignore */ }
    return null;
  }

  function preferredDraw() {
    try { return localStorage.getItem(PREF_KEY) === '3' ? 3 : 1; } catch (e) { return 1; }
  }

  /* ================= Boot ================= */

  function init() {
    loadStats();
    buildDOM();
    computeMetrics();

    board.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    board.addEventListener('contextmenu', e => e.preventDefault());

    $('btn-new').addEventListener('click', openNewGame);
    $('btn-mode').addEventListener('click', openNewGame);
    $('btn-undo').addEventListener('click', undo);
    $('btn-auto').addEventListener('click', autoFinish);
    $('btn-hint').addEventListener('click', showHint);

    // Sound: unlock audio on the first gesture; header button toggles on/off
    document.addEventListener('pointerdown', () => Snd.unlock(), { capture: true });
    const soundBtn = $('btn-sound');
    const renderSound = () => {
      soundBtn.setAttribute('aria-pressed', String(Snd.enabled));
      soundBtn.setAttribute('aria-label', Snd.enabled ? 'Sound on' : 'Sound off');
      soundBtn.title = Snd.enabled ? 'Sound on' : 'Sound off';
    };
    soundBtn.addEventListener('click', () => {
      Snd.setEnabled(!Snd.enabled);
      renderSound();
      Snd.play('hint');
      showToast(Snd.enabled ? 'Sound on' : 'Sound off');
    });
    renderSound();
    $('btn-stats').addEventListener('click', openStats);
    $('btn-reset-stats').addEventListener('click', resetStats);
    document.querySelectorAll('[data-stats-mode]').forEach(b =>
      b.addEventListener('click', () => { statsMode = +b.dataset.statsMode; renderStats(); }));
    document.querySelectorAll('#modal-new .choice').forEach(b =>
      b.addEventListener('click', () => startNewGame(+b.dataset.draw)));
    document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeModals));
    ['modal-new', 'modal-stats'].forEach(id =>
      $(id).addEventListener('click', e => { if (e.target.id === id) closeModals(); }));
    $('btn-again').addEventListener('click', () => startNewGame(S.drawCount));
    $('btn-change').addEventListener('click', openNewGame);

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        computeMetrics();
        if (!celebrating) snapLayout();
      }, 80);
    });

    // Clock: runs once the first move is made, pauses when the app is hidden
    setInterval(() => {
      if (S && S.started && !S.won && !document.hidden) {
        S.elapsed++;
        updateUI();
        if (S.elapsed % 5 === 0) save();
      }
    }, 1000);
    document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

    const saved = load();
    if (saved) {
      S = saved.state;
      history = Array.isArray(saved.history) ? saved.history : [];
      snapLayout();
      updateUI();
    } else {
      startNewGame(preferredDraw());
    }
  }

  init();
})();
