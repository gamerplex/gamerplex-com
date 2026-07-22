// Juice — the dopamine layer. Synthesised Web Audio SFX (no asset files, works
// offline, zero load cost) + haptics. Generalised from Dungeon's playFanfare so every
// reward moment across PLG can feel satisfying: a tap click, an XP blip, a level-up
// arpeggio, a goal-complete chord. Audio needs a user gesture to start on mobile — the
// first call after any tap unlocks it; earlier calls fail silently (visual still plays).

type Sfx = "tap" | "xp" | "levelup" | "complete" | "error";

let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  try {
    if (typeof window === "undefined") return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

// One tone. type/vol/attack shape the character; times are relative to `at`.
function tone(c: AudioContext, freq: number, at: number, dur: number, vol = 0.22, type: OscillatorType = "triangle") {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(at);
  o.stop(at + dur + 0.02);
}

const PATTERNS: Record<Sfx, (c: AudioContext, t: number) => void> = {
  // soft click — for taps/selection
  tap: (c, t) => tone(c, 440, t, 0.06, 0.12, "sine"),
  // quick rising blip — earning XP / a small win
  xp: (c, t) => { tone(c, 659.25, t, 0.09, 0.16); tone(c, 987.77, t + 0.05, 0.1, 0.16); },
  // triumphant arpeggio C-E-G-C — level up
  levelup: (c, t) => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, f, t + i * 0.1, 0.4, 0.22)),
  // full major chord — goal / milestone complete
  complete: (c, t) => { [523.25, 659.25, 783.99].forEach((f) => tone(c, f, t, 0.6, 0.16)); tone(c, 1046.5, t + 0.12, 0.6, 0.14); },
  // downward buzz — soft failure
  error: (c, t) => { tone(c, 220, t, 0.18, 0.14, "sawtooth"); tone(c, 164.81, t + 0.1, 0.2, 0.12, "sawtooth"); },
};

export function sfx(name: Sfx) {
  const c = ac();
  if (!c) return;
  try {
    PATTERNS[name](c, c.currentTime);
  } catch {
    /* audio blocked — visual celebration still plays */
  }
}

// Haptic feedback (mobile). Ignored where unsupported (desktop / iOS Safari).
export function haptic(pattern: number | number[] = 12) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
  } catch {
    /* no haptics */
  }
}

// Combined reward beats — sound + matching haptic.
export function celebrate(kind: "levelup" | "complete" = "levelup") {
  sfx(kind);
  haptic(kind === "complete" ? [18, 40, 30] : [14, 30, 20]);
}
