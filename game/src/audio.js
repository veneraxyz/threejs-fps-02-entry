// DUSTFALL — sounds, synthesized with WebAudio. No audio files, no
// network: every effect is an oscillator or a noise buffer shaped by an
// envelope. The context is created lazily on the first user gesture.

let ctx = null;
let master = null;

export function ensureAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
}

function noiseBuffer(seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

let noiseShort = null;
let noiseLong = null;

function playNoise(dur, filterFreq, gainPeak, type = 'lowpass') {
  if (!ctx) return;
  if (!noiseShort) noiseShort = noiseBuffer(0.3);
  const src = ctx.createBufferSource();
  src.buffer = noiseShort;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = filterFreq;
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(gainPeak, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.05);
}

function playTone(freq, dur, gainPeak, type = 'sine', slideTo = null) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(gainPeak, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

export const sfx = {
  shoot(kind) {
    if (kind === 'rifle') playNoise(0.14, 2400, 0.9);
    else if (kind === 'smg') playNoise(0.09, 3200, 0.7);
    else playNoise(0.12, 1800, 0.8);
    playTone(120, 0.08, 0.5, 'triangle', 55);
  },
  shootFar() {
    playNoise(0.16, 700, 0.35);
  },
  dryFire() {
    playTone(1400, 0.04, 0.25, 'square');
  },
  reload() {
    playTone(900, 0.05, 0.3, 'square');
    setTimeout(() => playTone(700, 0.06, 0.3, 'square'), 180);
  },
  hit() {
    playTone(2200, 0.05, 0.35, 'sine');
  },
  headshot() {
    playTone(2800, 0.07, 0.4, 'sine');
    setTimeout(() => playTone(3400, 0.06, 0.3, 'sine'), 60);
  },
  kill() {
    playTone(660, 0.09, 0.35, 'sine');
    setTimeout(() => playTone(990, 0.12, 0.35, 'sine'), 90);
  },
  hurt() {
    playTone(180, 0.12, 0.5, 'sawtooth', 90);
  },
  plant() {
    playTone(880, 0.12, 0.4, 'square');
    setTimeout(() => playTone(880, 0.12, 0.4, 'square'), 160);
  },
  beep() {
    playTone(1200, 0.07, 0.35, 'square');
  },
  defuse() {
    playTone(660, 0.1, 0.35, 'sine');
    setTimeout(() => playTone(880, 0.14, 0.35, 'sine'), 120);
  },
  explosion() {
    if (!ctx) return;
    if (!noiseLong) noiseLong = noiseBuffer(1.2);
    const src = ctx.createBufferSource();
    src.buffer = noiseLong;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(1.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    src.connect(filter).connect(g).connect(master);
    src.start(t);
    playTone(60, 0.9, 0.8, 'sine', 30);
  },
  roundWin() {
    [523, 659, 784].forEach((f, i) => setTimeout(() => playTone(f, 0.16, 0.35, 'sine'), i * 110));
  },
  roundLose() {
    [392, 330, 262].forEach((f, i) => setTimeout(() => playTone(f, 0.18, 0.3, 'sine'), i * 130));
  },
  buy() {
    playTone(1046, 0.08, 0.3, 'sine');
    setTimeout(() => playTone(1318, 0.1, 0.3, 'sine'), 80);
  },
  denied() {
    playTone(220, 0.12, 0.35, 'square');
  },
};
