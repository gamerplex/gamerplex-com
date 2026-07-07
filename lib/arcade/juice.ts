// Game-feel "juice": Web Audio SFX + haptics + reduced-motion, dependency-free.
// Synthesized from the game-feel research (Vlambeer screenshake, Jonasson/Purho
// "juice it or lose it", Swink game-feel): every action gets immediate multi-
// channel feedback; combos escalate pitch; all motion respects prefers-reduced-
// motion; audio is 0 KB (Web Audio oscillators) and MUTED by default on web.

const MUTE_KEY = "gpx_sfx_muted";

let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function isMuted(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(MUTE_KEY) === "1";
}
export function setMuted(m: boolean) {
  if (typeof window !== "undefined") window.localStorage.setItem(MUTE_KEY, m ? "1" : "0");
}

// A short synthesized blip (osc + gain envelope). freq in Hz, dur in seconds.
function blip(freq: number, dur: number, type: OscillatorType = "triangle", gain = 0.18) {
  if (isMuted()) return;
  const a = ac();
  if (!a) return;
  const t = a.currentTime;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// Valid rung: pitch RISES with the combo streak (a semitone per rung, capped) —
// the compulsion loop (rising anticipation). streak = consecutive valid rungs.
export function sfxRung(streak: number) {
  const semis = Math.min(streak, 14);
  blip(294 * Math.pow(2, semis / 12), 0.11, "triangle", 0.16);
}
export function sfxInvalid() {
  blip(150, 0.13, "sawtooth", 0.12);
}
// Milestone (new streak tier / big rung): a quick ascending arpeggio.
export function sfxMilestone() {
  if (isMuted()) return;
  [523, 659, 784].forEach((f, i) => setTimeout(() => blip(f, 0.12, "triangle", 0.16), i * 70));
}
export function sfxGameOver(win: boolean) {
  if (isMuted()) return;
  const notes = win ? [523, 659, 784, 1046] : [392, 330];
  notes.forEach((f, i) => setTimeout(() => blip(f, 0.16, win ? "triangle" : "sine", 0.16), i * 90));
}

// Haptics — progressive enhancement (iOS Safari no-ops). Very short = UI feedback.
type Haptic = "rung" | "milestone" | "invalid" | "gameover";
const PATTERNS: Record<Haptic, number | number[]> = {
  rung: 12,
  milestone: [15, 40, 15],
  invalid: 28,
  gameover: [180, 50, 180],
};
export function haptic(kind: Haptic) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try { navigator.vibrate(PATTERNS[kind]); } catch { /* ignore */ }
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
