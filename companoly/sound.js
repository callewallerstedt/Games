// Sound effects, synthesized with WebAudio (no audio files to load).
// Dice clacks are driven by the physics sim's real collision impacts.

let ctx = null;
let master = null;
let noiseBuf = null;
let muted = (() => { try { return localStorage.getItem("cmp_muted") === "1"; } catch { return false; } })();
const VOLUME = 0.75;

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : VOLUME;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master.connect(comp);
    comp.connect(ctx.destination);
    const len = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}
// Browsers only allow audio after a user gesture.
for (const ev of ["pointerdown", "keydown"]) window.addEventListener(ev, () => ac(), { passive: true });

export const isMuted = () => muted;
export function setMuted(m) {
  muted = !!m;
  try { localStorage.setItem("cmp_muted", muted ? "1" : "0"); } catch {}
  if (master) master.gain.value = muted ? 0 : VOLUME;
}

const rand = (a, b) => a + Math.random() * (b - a);

function env(g, t0, peak, attack, dur) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + dur);
}

function burst({ t = 0, dur = 0.05, freq = 3000, q = 1, gain = 0.4, type = "bandpass", sweepTo = null, attack = 0.002 }) {
  const a = ac();
  if (!a || muted) return;
  const t0 = a.currentTime + t;
  const src = a.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = rand(0.8, 1.2);
  const f = a.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t0);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + attack + dur);
  f.Q.value = q;
  const g = a.createGain();
  env(g, t0, gain, attack, dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + attack + dur + 0.05);
}

function tone({ t = 0, f = 440, f2 = null, dur = 0.2, type = "sine", gain = 0.25, attack = 0.004, lp = null }) {
  const a = ac();
  if (!a || muted) return;
  const t0 = a.currentTime + t;
  const o = a.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + attack + dur);
  const g = a.createGain();
  env(g, t0, gain, attack, dur);
  let node = o.connect(g);
  if (lp) {
    const filt = a.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = lp;
    node = node.connect(filt);
  }
  node.connect(master);
  o.start(t0);
  o.stop(t0 + attack + dur + 0.05);
}

let lastCash = 0;
export const sfx = {
  // One die impact. v = impact speed from the physics sim; kind = "floor" | "wall" | "dice".
  diceHit(v, kind = "floor") {
    const g = Math.min(1, v / 13) ** 1.2;
    if (g < 0.03) return;
    if (kind === "dice") {
      burst({ dur: 0.03 + 0.03 * g, freq: rand(3600, 4600), q: 4, gain: 0.7 * g });
      tone({ f: rand(2300, 2700), dur: 0.04, type: "triangle", gain: 0.18 * g });
    } else {
      // Plastic on felt/wood: a woody knock plus a bright click.
      burst({ dur: 0.025 + 0.04 * g, freq: rand(1800, 2600), q: 2.5, gain: 0.65 * g });
      tone({ f: rand(170, 230) * (kind === "wall" ? 1.4 : 1), f2: 120, dur: 0.06 + 0.05 * g, type: "sine", gain: 0.45 * g });
      tone({ f: rand(950, 1250), dur: 0.03, type: "triangle", gain: 0.12 * g });
    }
  },
  // Fallback when the 3D dice can't run.
  rattle() {
    for (let k = 0; k < 9; k++) setTimeout(() => sfx.diceHit(rand(3, 12), Math.random() < 0.3 ? "dice" : "floor"), k * rand(55, 95));
  },
  shake() { for (let k = 0; k < 5; k++) burst({ t: k * 0.045, dur: 0.03, freq: rand(3000, 4500), q: 3, gain: 0.12 }); },
  step(k = 0) {
    const hi = k % 2;
    burst({ dur: 0.035, freq: hi ? 1300 : 1050, q: 2, gain: 0.22 });
    tone({ f: hi ? 210 : 175, f2: 120, dur: 0.07, gain: 0.32 });
  },
  land() { tone({ f: 140, f2: 80, dur: 0.14, gain: 0.4 }); burst({ dur: 0.06, freq: 900, q: 1.5, gain: 0.2 }); },
  whoosh() { burst({ dur: 0.38, freq: 350, sweepTo: 2600, q: 1.2, gain: 0.35, attack: 0.05 }); },
  card() {
    burst({ dur: 0.18, freq: 1800, sweepTo: 5200, q: 0.8, gain: 0.25, attack: 0.02 });
    burst({ t: 0.16, dur: 0.05, freq: 3500, q: 2, gain: 0.22 });
  },
  coin(big = false) {
    tone({ f: 1318, dur: 0.08, type: "triangle", gain: 0.2 });
    tone({ t: 0.07, f: 1976, dur: big ? 0.45 : 0.28, type: "triangle", gain: 0.2 });
    if (big) tone({ t: 0.14, f: 2637, dur: 0.4, type: "sine", gain: 0.12 });
  },
  pay(big = false) {
    tone({ f: 392, f2: 262, dur: big ? 0.35 : 0.2, type: "square", gain: 0.06, lp: 1400 });
    tone({ t: 0.03, f: 196, f2: 131, dur: big ? 0.4 : 0.22, type: "sine", gain: 0.2 });
  },
  cash(amount, mine) {
    const now = performance.now();
    if (now - lastCash < 90) return;
    lastCash = now;
    if (amount > 0) { if (mine || amount >= 200) sfx.coin(amount >= 200); }
    else if (mine) sfx.pay(amount <= -300);
  },
  register() {
    burst({ dur: 0.04, freq: 2500, q: 3, gain: 0.35 });
    burst({ t: 0.05, dur: 0.05, freq: 1800, q: 3, gain: 0.3 });
    tone({ t: 0.1, f: 1568, dur: 0.6, type: "sine", gain: 0.22 });
    tone({ t: 0.1, f: 2093, dur: 0.7, type: "sine", gain: 0.16 });
    tone({ t: 0.1, f: 3136, dur: 0.4, type: "sine", gain: 0.07 });
  },
  build() {
    tone({ f: 110, f2: 55, dur: 0.22, gain: 0.55 });
    burst({ dur: 0.08, freq: 700, q: 1.2, gain: 0.35 });
    burst({ t: 0.12, dur: 0.05, freq: 2600, q: 3, gain: 0.2 });
  },
  clang() {
    [196, 331, 523, 742, 1015].forEach((f, k) => tone({ f, dur: 1.4 - k * 0.15, type: "sine", gain: 0.16 - k * 0.02, attack: 0.002 }));
    burst({ dur: 0.12, freq: 1500, q: 1, gain: 0.35 });
    tone({ t: 0.25, f: 880, f2: 660, dur: 0.25, type: "sawtooth", gain: 0.05, lp: 2000 });
    tone({ t: 0.55, f: 880, f2: 660, dur: 0.25, type: "sawtooth", gain: 0.05, lp: 2000 });
  },
  gavel() { tone({ f: 170, f2: 90, dur: 0.1, gain: 0.5 }); burst({ dur: 0.04, freq: 1600, q: 2, gain: 0.35 }); },
  sold() { sfx.gavel(); setTimeout(sfx.gavel, 180); setTimeout(() => { sfx.gavel(); sfx.register(); }, 360); },
  tick() { burst({ dur: 0.02, freq: 4200, q: 4, gain: 0.18 }); },
  chime() {
    tone({ f: 784, dur: 0.35, type: "triangle", gain: 0.18 });
    tone({ t: 0.13, f: 1175, dur: 0.55, type: "triangle", gain: 0.18 });
  },
  alert() {
    tone({ f: 988, dur: 0.1, type: "square", gain: 0.06, lp: 2500 });
    tone({ t: 0.15, f: 1319, dur: 0.16, type: "square", gain: 0.06, lp: 2500 });
  },
  sad() {
    tone({ f: 392, f2: 370, dur: 0.3, type: "sawtooth", gain: 0.12, lp: 1200 });
    tone({ t: 0.38, f: 370, f2: 349, dur: 0.3, type: "sawtooth", gain: 0.12, lp: 1200 });
    tone({ t: 0.76, f: 349, f2: 247, dur: 0.9, type: "sawtooth", gain: 0.13, lp: 1000 });
  },
  sting(up = true) {
    const notes = up ? [523, 659, 988] : [659, 523, 392];
    notes.forEach((f, k) => tone({ t: k * 0.09, f, dur: 0.18, type: "triangle", gain: 0.14 }));
  },
  sparkle() { [1568, 2093, 2637, 3136].forEach((f, k) => tone({ t: k * 0.05, f, dur: 0.25, type: "sine", gain: 0.08 })); },
  fanfare() {
    [523, 659, 784, 1047].forEach((f, k) => tone({ t: k * 0.12, f, dur: 0.3, type: "triangle", gain: 0.2 }));
    tone({ t: 0.5, f: 1047, dur: 1.1, type: "triangle", gain: 0.2 });
    tone({ t: 0.5, f: 784, dur: 1.1, type: "triangle", gain: 0.14 });
  },
};
