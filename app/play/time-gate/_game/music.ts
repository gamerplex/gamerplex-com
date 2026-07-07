// Time Gate — adaptive synth (Rez-style synesthesia). A continuous pad whose
// brightness + volume CRESCENDO as the next gate approaches, resolving with a
// bright arpeggio stab when you pass through it. Pure WebAudio, 0 KB deps.
// Respects the shared mute flag. Robust: any failure no-ops (never crashes the game).

import { isMuted } from "../../../../lib/arcade/juice";

// A minor pentatonic-ish set (Hz) for the resolve arps — always "musical".
const ARP = [220, 261.63, 329.63, 392, 523.25];

export class TimeGateMusic {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private padGain!: GainNode;
  private padFilter!: BiquadFilterNode;
  private oscs: OscillatorNode[] = [];
  private started = false;

  start() {
    if (this.started || isMuted()) return;
    try {
      const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      const ctx = new Ctx();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.0;
      this.master.connect(ctx.destination);

      this.padFilter = ctx.createBiquadFilter();
      this.padFilter.type = "lowpass";
      this.padFilter.frequency.value = 400;
      this.padFilter.Q.value = 6;
      this.padGain = ctx.createGain();
      this.padGain.gain.value = 0.5;
      this.padFilter.connect(this.padGain);
      this.padGain.connect(this.master);

      // 3 detuned saws — a warm root drone (A2 based).
      [110, 110.4, 164.81].forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = f;
        o.detune.value = (i - 1) * 6;
        o.connect(this.padFilter);
        o.start();
        this.oscs.push(o);
      });

      // gentle fade-in
      const t = ctx.currentTime;
      this.master.gain.setValueAtTime(0, t);
      this.master.gain.linearRampToValueAtTime(0.28, t + 1.2);
      this.started = true;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
    } catch {
      this.ctx = null;
    }
  }

  resume() {
    if (this.ctx?.state === "suspended") this.ctx.resume().catch(() => {});
  }

  /** approach ∈ 0..1 — how close the next gate is. Drives the crescendo. */
  setApproach(approach: number) {
    if (!this.ctx) return;
    const p = Math.max(0, Math.min(1, approach));
    const t = this.ctx.currentTime;
    // brightness + swell rise as the gate nears
    this.padFilter.frequency.setTargetAtTime(300 + p * p * 3800, t, 0.08);
    this.padGain.gain.setTargetAtTime(0.35 + p * 0.5, t, 0.08);
  }

  /** passing through a gate — a bright ascending arpeggio resolve. */
  hit() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    // filter pop
    this.padFilter.frequency.setValueAtTime(4200, t0);
    this.padFilter.frequency.setTargetAtTime(600, t0 + 0.05, 0.25);
    // 4-note arp up
    ARP.slice(0, 4).forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "triangle";
      o.frequency.value = f * 2;
      const t = t0 + i * 0.05;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 0.28);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + 0.3);
    });
  }

  /** low, dark hit for damage/miss. */
  thud() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square";
    o.frequency.value = 70;
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.35);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.4);
  }

  stop() {
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(0, t, 0.2);
      this.oscs.forEach((o) => o.stop(t + 0.6));
      const ctx = this.ctx;
      setTimeout(() => { try { ctx.close(); } catch {} }, 800);
    } catch {}
    this.ctx = null;
    this.started = false;
  }
}
