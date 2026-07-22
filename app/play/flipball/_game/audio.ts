let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  return ctx;
}

interface BeepOpts {
  freq: number;
  freqTo?: number;
  type?: OscillatorType;
  ms: number;
  gain?: number;
}

function beep({ freq, freqTo, type = 'sine', ms, gain = 0.12 }: BeepOpts): void {
  const a = ac(); if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  const t = a.currentTime;
  const sec = ms / 1000;
  o.frequency.setValueAtTime(freq, t);
  if (freqTo !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), t + sec);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + sec);
  o.connect(g).connect(a.destination);
  o.start();
  o.stop(t + sec);
}

const PITCH_STEPS = [1.0, 1.122, 1.26, 1.414, 1.587];

function pitched(base: BeepOpts, idx: number): BeepOpts {
  const s = PITCH_STEPS[idx % PITCH_STEPS.length];
  return { ...base, freq: base.freq * s, freqTo: base.freqTo ? base.freqTo * s : undefined };
}

export const sfx = {
  bumper:     (idx = 0) => beep(pitched({ freq: 800, freqTo: 400,  type: 'sine',     ms: 90,  gain: 0.18 }, idx)),
  slingshot:  (idx = 0) => beep(pitched({ freq: 220, freqTo: 90,   type: 'square',   ms: 60,  gain: 0.14 }, idx)),
  dropTarget: (idx = 0) => beep(pitched({ freq: 600, freqTo: 1400, type: 'triangle', ms: 80,  gain: 0.16 }, idx)),
  bankClear:  () => beep({ freq: 880, freqTo: 1760, type: 'sine',     ms: 350, gain: 0.20 }),
  ballLost:   () => beep({ freq: 300, freqTo: 60,   type: 'sawtooth', ms: 500, gain: 0.18 }),
  flipper:    () => beep({ freq: 140, freqTo: 100,  type: 'square',   ms: 35,  gain: 0.06 }),
  start:      () => { beep({ freq: 440, freqTo: 880, type: 'sine', ms: 120, gain: 0.18 });
                      setTimeout(() => beep({ freq: 660, freqTo: 1320, type: 'sine', ms: 150, gain: 0.18 }), 100); },
};

export function unlockAudio(): void {
  const a = ac(); if (!a) return;
  if (a.state === 'suspended') a.resume();
}
