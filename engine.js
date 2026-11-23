/*
 * It's Just Solitaire — rules engine (Klondike).
 * Pure game logic with no DOM access, so it can be reused when porting
 * to native phone apps. All state is plain JSON-serialisable data.
 *
 * Card ids: 0..51, id = suitIndex * 13 + (rank - 1)
 * Pile arrays hold card ids; the last element is the top card.
 */
(function (root) {
  'use strict';

  const SUITS = ['S', 'H', 'D', 'C'];
  const LABELS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  const suitOf = id => SUITS[Math.floor(id / 13)];
  const rankOf = id => (id % 13) + 1;
  const isRed = id => { const s = suitOf(id); return s === 'H' || s === 'D'; };

  // Scoring (common "standard" Klondike scoring)
  const SCORE = {
    wasteToTableau: 5,
    toFoundation: 10,
    revealCard: 5,
    foundationToTableau: -15,
    recycleDraw1: -100,
    recycleDraw3: -20,
    timePenaltyEvery: 10, // seconds
    timePenalty: 2,
    bonusNumerator: 700000,
    bonusMinSeconds: 30,
  };

  function randomInt(n) {
    if (root.crypto && root.crypto.getRandomValues) {
      const buf = new Uint32Array(1);
      root.crypto.getRandomValues(buf);
      return buf[0] % n;
    }
    return Math.floor(Math.random() * n);
  }

  function shuffledDeck(rng) {
    const ids = Array.from({ length: 52 }, (_, i) => i);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = rng ? Math.floor(rng() * (i + 1)) : randomInt(i + 1);
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids;
  }

  /** Create and deal a new game. Returns { state, dealOrder }. */
  function newGame(drawCount, rng) {
    const deck = shuffledDeck(rng);
    const state = {
      drawCount: drawCount === 3 ? 3 : 1,
      stock: [],
      waste: [],
      foundations: [[], [], [], []],
      tableau: [[], [], [], [], [], [], []],
      up: new Array(52).fill(false),
      score: 0,
      moves: 0,
      passes: 0,
      elapsed: 0,
      started: false,
      won: false,
      bonus: 0,
      counted: false,  // counted as "played" in stats
      recorded: false, // win recorded in stats
    };
    const dealOrder = [];
    let k = 0;
    for (let row = 0; row < 7; row++) {
      for (let col = row; col < 7; col++) {
        const id = deck[k++];
        state.tableau[col].push(id);
        dealOrder.push(id);
      }
    }
    state.tableau.forEach(p => { state.up[p[p.length - 1]] = true; });
    state.stock = deck.slice(k);
    return { state, dealOrder };
  }

  function getPile(state, type, index) {
    switch (type) {
      case 'stock': return state.stock;
      case 'waste': return state.waste;
      case 'foundation': return state.foundations[index];
      case 'tableau': return state.tableau[index];
      default: throw new Error('Unknown pile ' + type);
    }
  }

  /** Find a card: { type, index, pos } */
  function locate(state, id) {
    let pos = state.stock.indexOf(id);
    if (pos >= 0) return { type: 'stock', index: 0, pos };
    pos = state.waste.indexOf(id);
    if (pos >= 0) return { type: 'waste', index: 0, pos };
    for (let i = 0; i < 4; i++) {
      pos = state.foundations[i].indexOf(id);
      if (pos >= 0) return { type: 'foundation', index: i, pos };
    }
    for (let i = 0; i < 7; i++) {
      pos = state.tableau[i].indexOf(id);
      if (pos >= 0) return { type: 'tableau', index: i, pos };
    }
    return null;
  }

  const top = pile => pile[pile.length - 1];

  function canFoundation(state, id, fi) {
    const pile = state.foundations[fi];
    if (!pile.length) return rankOf(id) === 1;
    const t = top(pile);
    return suitOf(t) === suitOf(id) && rankOf(id) === rankOf(t) + 1;
  }

  function canTableau(state, id, ti) {
    const pile = state.tableau[ti];
    if (!pile.length) return rankOf(id) === 13;
    const t = top(pile);
    return state.up[t] && isRed(t) !== isRed(id) && rankOf(t) === rankOf(id) + 1;
  }

  /** Which cards may be picked up starting at this card (or null). */
  function pickable(state, id) {
    const loc = locate(state, id);
    if (!loc || loc.type === 'stock' || !state.up[id]) return null;
    const pile = getPile(state, loc.type, loc.index);
    if (loc.type !== 'tableau' && loc.pos !== pile.length - 1) return null;
    return { loc, ids: pile.slice(loc.pos) };
  }

  function isLegal(state, loc, ids, toType, toIndex) {
    if (toType === 'foundation') {
      return ids.length === 1 && loc.type !== 'foundation' && canFoundation(state, ids[0], toIndex);
    }
    if (toType === 'tableau') {
      if (loc.type === 'tableau' && loc.index === toIndex) return false;
      return canTableau(state, ids[0], toIndex);
    }
    return false;
  }

  /** Apply a move (assumes legal). Returns ids that moved/changed. */
  function move(state, loc, toType, toIndex) {
    const src = getPile(state, loc.type, loc.index);
    const moving = src.splice(loc.pos);
    getPile(state, toType, toIndex).push(...moving);
    const changed = moving.slice();

    if (loc.type === 'waste' && toType === 'tableau') state.score += SCORE.wasteToTableau;
    else if (toType === 'foundation') state.score += SCORE.toFoundation;
    else if (loc.type === 'foundation' && toType === 'tableau') state.score += SCORE.foundationToTableau;

    if (loc.type === 'tableau' && src.length && !state.up[top(src)]) {
      state.up[top(src)] = true;
      state.score += SCORE.revealCard;
      changed.push(top(src));
    }
    state.moves++;
    state.started = true;
    checkWin(state);
    return changed;
  }

  /** Tap on the stock: draw cards or recycle the waste. */
  function draw(state) {
    if (!state.stock.length) {
      if (!state.waste.length) return null;
      state.stock = state.waste.reverse();
      state.waste = [];
      state.stock.forEach(id => { state.up[id] = false; });
      state.passes++;
      state.score += state.drawCount === 1 ? SCORE.recycleDraw1 : SCORE.recycleDraw3;
      state.moves++;
      state.started = true;
      return { recycled: true, ids: state.stock.slice() };
    }
    const n = Math.min(state.drawCount, state.stock.length);
    const ids = [];
    for (let i = 0; i < n; i++) {
      const id = state.stock.pop();
      state.up[id] = true;
      state.waste.push(id);
      ids.push(id);
    }
    state.moves++;
    state.started = true;
    return { recycled: false, ids };
  }

  /** Best destination for a tapped card, or null. */
  function autoTarget(state, id) {
    const pick = pickable(state, id);
    if (!pick) return null;
    const { loc, ids } = pick;
    if (ids.length === 1 && loc.type !== 'foundation') {
      for (let fi = 0; fi < 4; fi++) {
        if (canFoundation(state, id, fi)) return { loc, type: 'foundation', index: fi };
      }
    }
    let empty = -1;
    for (let ti = 0; ti < 7; ti++) {
      if (!isLegal(state, loc, ids, 'tableau', ti)) continue;
      if (state.tableau[ti].length) return { loc, type: 'tableau', index: ti };
      // Don't shuffle a King that already sits at the bottom of a column.
      if (empty < 0 && !(loc.type === 'tableau' && loc.pos === 0)) empty = ti;
    }
    return empty >= 0 ? { loc, type: 'tableau', index: empty } : null;
  }

  function canAutoFinish(state) {
    return !state.won && !state.stock.length && !state.waste.length &&
      state.tableau.every(p => p.every(id => state.up[id]));
  }

  /** Next foundation move for auto-finish (lowest rank first). */
  function nextFinishMove(state) {
    let best = null;
    state.tableau.forEach((p, ti) => {
      if (!p.length) return;
      const id = top(p);
      for (let fi = 0; fi < 4; fi++) {
        if (canFoundation(state, id, fi) && (!best || rankOf(id) < rankOf(best.id))) {
          best = { id, loc: { type: 'tableau', index: ti, pos: p.length - 1 }, type: 'foundation', index: fi };
        }
      }
    });
    return best;
  }

  function checkWin(state) {
    if (!state.won && state.foundations.every(p => p.length === 13)) {
      state.won = true;
      state.bonus = state.elapsed >= SCORE.bonusMinSeconds
        ? Math.round(SCORE.bonusNumerator / state.elapsed) : 0;
    }
    return state.won;
  }

  function displayScore(state) {
    const penalty = Math.floor(state.elapsed / SCORE.timePenaltyEvery) * SCORE.timePenalty;
    return Math.max(0, state.score - penalty) + (state.won ? state.bonus : 0);
  }

  /** Undo snapshot: everything except the clock. */
  function snapshot(state) {
    return JSON.stringify({
      stock: state.stock, waste: state.waste, foundations: state.foundations,
      tableau: state.tableau, up: state.up, score: state.score,
      moves: state.moves, passes: state.passes,
    });
  }

  function restore(state, snap) {
    Object.assign(state, JSON.parse(snap));
  }

  /** Sanity-check a saved state. */
  function isValidState(s) {
    try {
      const all = [...s.stock, ...s.waste, ...s.foundations.flat(), ...s.tableau.flat()];
      return all.length === 52 && new Set(all).size === 52 &&
        all.every(id => Number.isInteger(id) && id >= 0 && id < 52) &&
        Array.isArray(s.up) && s.up.length === 52 &&
        s.foundations.length === 4 && s.tableau.length === 7;
    } catch (e) {
      return false;
    }
  }

  /* ---------------- Hints ---------------- */

  function foundationFor(state, id) {
    for (let fi = 0; fi < 4; fi++) if (canFoundation(state, id, fi)) return fi;
    return -1;
  }

  function placeableAnywhere(state, id) {
    if (foundationFor(state, id) >= 0) return true;
    for (let ti = 0; ti < 7; ti++) if (canTableau(state, id, ti)) return true;
    return false;
  }

  /**
   * Useful moves, best first. Each hint is either
   *   { kind: 'move', ids, loc, type, index, pri }   or   { kind: 'stock', pri }.
   * Pointless shuffles (e.g. moving a stack between columns without
   * revealing anything) are left out, so an empty list means "stuck".
   */
  function findHints(state) {
    const out = [];
    const add = (pri, h) => out.push(Object.assign({ kind: 'move', pri }, h));
    const faceUpStart = p => p.findIndex(id => state.up[id]);
    const kingWaiting = () =>
      (state.waste.length && rankOf(top(state.waste)) === 13) ||
      state.tableau.some(p => { const fu = faceUpStart(p); return fu > 0 && rankOf(p[fu]) === 13; });

    // 1. Anything that can go up to a foundation
    const tops = [];
    if (state.waste.length) tops.push({ id: top(state.waste), loc: { type: 'waste', index: 0, pos: state.waste.length - 1 } });
    state.tableau.forEach((p, ti) => {
      if (p.length) tops.push({ id: top(p), loc: { type: 'tableau', index: ti, pos: p.length - 1 } });
    });
    tops.forEach(({ id, loc }) => {
      const fi = foundationFor(state, id);
      if (fi < 0) return;
      const pile = loc.type === 'tableau' ? state.tableau[loc.index] : null;
      const reveals = pile && loc.pos > 0 && !state.up[pile[loc.pos - 1]];
      add(reveals ? 95 : 90, { ids: [id], loc, type: 'foundation', index: fi });
    });

    // 2. Column to column moves that achieve something
    state.tableau.forEach((p, ti) => {
      const fu = faceUpStart(p);
      if (fu < 0) return;
      for (let pos = fu; pos < p.length; pos++) {
        const id = p[pos];
        for (let tj = 0; tj < 7; tj++) {
          if (tj === ti || !canTableau(state, id, tj)) continue;
          const toEmpty = !state.tableau[tj].length;
          let pri = 0;
          if (pos === fu && fu > 0) pri = toEmpty ? 70 : 80;                // reveals a hidden card
          else if (toEmpty) pri = 0;                                        // King already at bottom
          else if (pos === 0) pri = kingWaiting() ? 45 : 0;                 // frees a column for a King
          else if (pos > fu && foundationFor(state, p[pos - 1]) >= 0) pri = 60; // unblocks a foundation play
          if (pri) {
            add(pri, { ids: p.slice(pos), loc: { type: 'tableau', index: ti, pos }, type: 'tableau', index: tj });
            break;
          }
        }
      }
    });

    // 3. Waste card into the columns
    if (state.waste.length) {
      const id = top(state.waste);
      const loc = { type: 'waste', index: 0, pos: state.waste.length - 1 };
      let empty = -1, placed = false;
      for (let tj = 0; tj < 7; tj++) {
        if (!canTableau(state, id, tj)) continue;
        if (state.tableau[tj].length) { add(50, { ids: [id], loc, type: 'tableau', index: tj }); placed = true; break; }
        if (empty < 0) empty = tj;
      }
      if (!placed && empty >= 0) add(55, { ids: [id], loc, type: 'tableau', index: empty });
    }

    // 4. Turn the stock, but only if some card in stock/waste could be played
    const pool = state.stock.concat(state.waste);
    if (pool.length && pool.some(id => placeableAnywhere(state, id))) out.push({ kind: 'stock', pri: 10 });

    return out.sort((a, b) => b.pri - a.pri);
  }

  /* ---------------- Statistics (pure data helpers) ---------------- */

  function emptyModeStats() {
    return { played: 0, won: 0, streak: 0, bestStreak: 0, bestScore: 0, bestTime: 0, fewestMoves: 0 };
  }

  function emptyStats() { return { 1: emptyModeStats(), 3: emptyModeStats() }; }

  function normalizeStats(raw) {
    const s = emptyStats();
    if (raw && typeof raw === 'object') {
      [1, 3].forEach(m => {
        const src = raw[m] || {};
        Object.keys(s[m]).forEach(k => {
          const v = src[k];
          if (Number.isFinite(v) && v >= 0) s[m][k] = Math.floor(v);
        });
      });
    }
    return s;
  }

  function statsGameStarted(stats, mode) { stats[mode].played++; }

  function statsGameLost(stats, mode) { stats[mode].streak = 0; }

  /** Record a win; returns which personal bests were beaten. */
  function statsGameWon(stats, mode, score, time, moves) {
    const s = stats[mode];
    s.won++;
    s.streak++;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    const best = {
      score: score > s.bestScore,
      time: !s.bestTime || time < s.bestTime,
      moves: !s.fewestMoves || moves < s.fewestMoves,
    };
    if (best.score) s.bestScore = score;
    if (best.time) s.bestTime = time;
    if (best.moves) s.fewestMoves = moves;
    return best;
  }

  root.SolitaireEngine = {
    SUITS, LABELS, SCORE, suitOf, rankOf, isRed,
    newGame, getPile, locate, canFoundation, canTableau, pickable, isLegal,
    move, draw, autoTarget, canAutoFinish, nextFinishMove, checkWin,
    displayScore, snapshot, restore, isValidState, findHints,
    emptyStats, normalizeStats, statsGameStarted, statsGameLost, statsGameWon,
  };
})(typeof window !== 'undefined' ? window : globalThis);
