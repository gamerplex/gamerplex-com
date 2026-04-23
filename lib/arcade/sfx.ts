// Retro SFX for Cyber Snake — synthesised via Web Audio API so zero asset
// download, zero third-party lib, <1ms latency. Sounds intentionally evoke
// 8-bit arcade aesthetics (square waves, noise bursts, pitch sweeps).
//
// Usage:
//   const sfx = getSfx();
//   sfx.eat();
//   sfx.crash();
//   sfx.setMuted(true);
//
// iOS / Safari require the first AudioContext resume to happen inside a user
// gesture. Call `sfx.unlock()` in a click/touch handler before any playback.

const MUTE_KEY = "gp.arcade.sfx.muted.v1";

export interface Sfx {
  unlock: () => void;
  eat: () => void;
  crash: () => void;
  starve: () => void;
  turn: () => void;
  start: () => void;
  uiClick: () => void;
  setMuted: (m: boolean) => void;
  isMuted: () => boolean;
}

let instance: Sfx | null = null;

export function getSfx(): Sfx {
  if (typeof window === "undefined") return makeNoopSfx();
  if (instance) return instance;
  instance = makeSfx();
  return instance;
}

function makeNoopSfx(): Sfx {
  return {
    unlock: () => {},
    eat: () => {},
    crash: () => {},
    starve: () => {},
    turn: () => {},
    start: () => {},
    uiClick: () => {},
    setMuted: () => {},
    isMuted: () => true,
  };
}

function makeSfx(): Sfx {
  let ctx: AudioContext | null = null;
  let muted = loadMuted();

  function ensureCtx(): AudioContext | null {
    if (muted) return null;
    if (!ctx) {
      try {
        const Ctor =
          (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!Ctor) return null;
        ctx = new Ctor();
      } catch {
        return null;
      }
    }
    return ctx;
  }

  // Square/triangle tone with attack-decay envelope.
  function tone(
    freq: number,
    durationMs: number,
    type: OscillatorType = "square",
    gain: number = 0.08,
    attackMs: number = 4,
    freqEndHz?: number,
  ) {
    const c = ensureCtx();
    if (!c) return;
    const now = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (freqEndHz !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(freqEndHz, 1),
        now + durationMs / 1000,
      );
    }
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + attackMs / 1000);
    g.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
    osc.connect(g).connect(c.destination);
    osc.start(now);
    osc.stop(now + durationMs / 1000);
  }

  // Pink/white noise burst — used for crash/explosion.
  function noiseBurst(durationMs: number, gain: number = 0.18) {
    const c = ensureCtx();
    if (!c) return;
    const now = c.currentTime;
    const sampleRate = c.sampleRate;
    const frameCount = Math.floor((durationMs / 1000) * sampleRate);
    const buffer = c.createBuffer(1, frameCount, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frameCount);
    }
    const src = c.createBufferSource();
    src.buffer = buffer;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
    // Lo-pass so it sounds less harsh.
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1200, now);
    src.connect(filter).connect(g).connect(c.destination);
    src.start(now);
    src.stop(now + durationMs / 1000);
  }

  function loadMuted(): boolean {
    try {
      return window.localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      return false;
    }
  }
  function saveMuted(m: boolean) {
    try {
      window.localStorage.setItem(MUTE_KEY, m ? "1" : "0");
    } catch {}
  }

  return {
    unlock() {
      // Called from the first user gesture to let iOS resume the context.
      const c = ensureCtx();
      if (c && c.state === "suspended") c.resume().catch(() => {});
    },
    eat() {
      // Two-step pitch bloop: low→high quick. Evokes Pac-Man pellet.
      tone(520, 60, "square", 0.08, 2, 900);
      setTimeout(() => tone(820, 50, "square", 0.06, 2, 1200), 40);
    },
    crash() {
      // Descending growl + noise burst.
      tone(180, 300, "sawtooth", 0.12, 6, 60);
      noiseBurst(260, 0.14);
    },
    starve() {
      // Lower, longer whine — distinct from crash.
      tone(260, 500, "triangle", 0.1, 10, 90);
      setTimeout(() => tone(140, 400, "sawtooth", 0.1, 8, 60), 100);
    },
    turn() {
      // Tiny click for direction change — barely audible, keeps it satisfying.
      tone(1100, 18, "square", 0.025, 1);
    },
    start() {
      // Four-note rising fanfare: C5 E5 G5 C6.
      const notes = [523, 659, 784, 1047];
      notes.forEach((f, i) => setTimeout(() => tone(f, 110, "square", 0.09, 2), i * 95));
    },
    uiClick() {
      tone(800, 22, "square", 0.04, 1);
    },
    setMuted(m: boolean) {
      muted = m;
      saveMuted(m);
      if (m && ctx) {
        ctx.close().catch(() => {});
        ctx = null;
      }
    },
    isMuted() {
      return muted;
    },
  };
}
