/*
 * It's Just Solitaire — sound effects.
 * Every sound is synthesised live with the Web Audio API from oscillators and
 * filtered white noise. There are no audio files, samples or recordings, so
 * nothing here comes from anyone else's work.
 */
(function (root) {
  'use strict';

  const PREF_KEY = 'ijs.sound';
  let ctx = null, master = null, noiseBuf = null;
  let unlocked = false; // browsers only allow audio after a user gesture
  let enabled = true;
  try { enabled = root.localStorage.getItem(PREF_KEY) !== 'off'; } catch (e) { /* ignore */ }

  function ensure() {
    if (!ctx) {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.7;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /** Call from a user gesture (tap/click) so audio is allowed to start. */
  function unlock() {
    unlocked = true;
    if (enabled) ensure();
  }

  function envelope(g, t, attack, peak, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  // Filtered noise burst: card taps, swishes, shuffles
  function noise(t, dur, o = {}) {
    const { type = 'bandpass', f0 = 2000, f1 = 0, q = 1, vol = 0.2, attack = 0.002 } = o;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.Q.value = q;
    filt.frequency.setValueAtTime(f0, t);
    if (f1) filt.frequency.exponentialRampToValueAtTime(f1, t + attack + dur);
    const g = ctx.createGain();
    envelope(g, t, attack, vol, dur);
    src.connect(filt).connect(g).connect(master);
    src.start(t, Math.random() * 0.8);
    src.stop(t + attack + dur + 0.05);
  }

  // Simple oscillator note: chimes, blips, fanfare
  function tone(t, freq, dur, o = {}) {
    const { type = 'sine', vol = 0.2, attack = 0.005, f1 = 0 } = o;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (f1) osc.frequency.exponentialRampToValueAtTime(f1, t + attack + dur);
    const g = ctx.createGain();
    envelope(g, t, attack, vol, dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + attack + dur + 0.05);
  }

  // Foundation chime climbs a major pentatonic scale with the card's rank
  const PENTA = [0, 2, 4, 7, 9];
  const BASE = 392; // G4
  const semis = s => BASE * Math.pow(2, s / 12);
  const chimeHz = rank => {
    const step = Math.max(0, rank - 1);
    return semis(PENTA[step % 5] + 12 * Math.floor(step / 5));
  };

  const SOUNDS = {
    pick(t) {
      noise(t, 0.03, { f0: 3800, q: 1.5, vol: 0.1 });
    },
    place(t) {
      noise(t, 0.045, { f0: 2200, q: 1.1, vol: 0.22 });
      tone(t, 170, 0.06, { vol: 0.1, f1: 110 });
    },
    flip(t) {
      noise(t, 0.09, { f0: 1400, f1: 4200, q: 0.9, vol: 0.12, attack: 0.01 });
    },
    draw(t, o) {
      const n = o.count || 1;
      for (let i = 0; i < n; i++) {
        noise(t + i * 0.07, 0.08, { f0: 1600, f1: 3800, q: 0.8, vol: 0.13, attack: 0.008 });
      }
    },
    recycle(t) {
      noise(t, 0.28, { f0: 4000, f1: 700, q: 0.7, vol: 0.14, attack: 0.03 });
    },
    foundation(t, o) {
      SOUNDS.place(t);
      const f = chimeHz(o.rank || 1);
      tone(t + 0.01, f, 0.45, { type: 'triangle', vol: 0.13 });
      tone(t + 0.01, f * 2, 0.25, { vol: 0.04 });
    },
    invalid(t) {
      tone(t, 220, 0.07, { vol: 0.13, f1: 180 });
      tone(t + 0.09, 180, 0.09, { vol: 0.11, f1: 140 });
    },
    undo(t) {
      noise(t, 0.12, { f0: 3200, f1: 900, q: 0.8, vol: 0.12, attack: 0.01 });
    },
    hint(t) {
      tone(t, 880, 0.18, { vol: 0.08 });
      tone(t + 0.09, 1318.5, 0.25, { vol: 0.07 });
    },
    shuffle(t) {
      for (let i = 0; i < 12; i++) {
        noise(t + i * 0.026 + Math.random() * 0.01, 0.03,
          { f0: 2400 + Math.random() * 1600, q: 1.2, vol: 0.09 });
      }
    },
    deal(t, o) {
      (o.times || []).forEach(ms => noise(t + ms / 1000, 0.035, { f0: 2400, q: 1.1, vol: 0.1 }));
    },
    win(t) {
      const run = [0, 4, 7, 12, 16, 19, 24];
      run.forEach((s, i) => tone(t + i * 0.09, semis(s), 0.5, { type: 'triangle', vol: 0.11 }));
      const end = t + run.length * 0.09;
      [12, 16, 19, 24].forEach(s => tone(end, semis(s), 1.3, { vol: 0.06, attack: 0.02 }));
      for (let i = 0; i < 10; i++) {
        tone(end + 0.15 + i * 0.07, 2000 + Math.random() * 2200, 0.12, { vol: 0.025 });
      }
    },
  };

  function play(name, opts = {}) {
    if (!enabled || !unlocked || !SOUNDS[name]) return;
    const c = ensure();
    if (!c) return;
    try { SOUNDS[name](c.currentTime + 0.005, opts); } catch (e) { /* never break the game */ }
  }

  function setEnabled(on) {
    enabled = !!on;
    try { root.localStorage.setItem(PREF_KEY, enabled ? 'on' : 'off'); } catch (e) { /* ignore */ }
    if (ctx) {
      if (enabled) ctx.resume(); else ctx.suspend();
    }
  }

  root.SolitaireSound = {
    play, unlock, setEnabled,
    get enabled() { return enabled; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
