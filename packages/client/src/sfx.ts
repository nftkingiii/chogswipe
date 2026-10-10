// Synthesized sound: no audio files, nothing to license. Starts on the first key or click
// (browsers block audio before that). M toggles everything.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let music: { stop: () => void } | null = null;

try {
  muted = localStorage.getItem("chogswipe.muted") === "1";
} catch {
  /* default on */
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function unlockAudio() {
  audio();
}

export function toggleMute(): boolean {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.5;
  try {
    localStorage.setItem("chogswipe.muted", muted ? "1" : "0");
  } catch {
    /* ignore */
  }
  return muted;
}

export const isMuted = () => muted;

function tone(freq: number, dur: number, type: OscillatorType = "square", vol = 0.2, slideTo?: number, delay = 0) {
  const a = audio();
  if (!a || !master || muted) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol = 0.2, filter = 1200, delay = 0) {
  const a = audio();
  if (!a || !master || muted) return;
  const t = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = filter;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

export const sfx = {
  step: () => noise(0.05, 0.06, 900),
  jump: () => tone(300, 0.18, "square", 0.08, 720),
  land: () => noise(0.08, 0.12, 500),
  scout: () => [880, 1320, 1760].forEach((f, i) => tone(f, 0.12, "sine", 0.08, undefined, i * 0.05)),
  trap: (kind: string) => {
    if (kind === "Crybaby Alarm") [0, 0.25, 0.5].forEach((d) => tone(700, 0.22, "sawtooth", 0.1, 1200, d));
    else if (kind === "Spring Plate") tone(180, 0.3, "triangle", 0.18, 900);
    else if (kind === "Slick Floor") tone(500, 0.35, "sine", 0.15, 120);
    else if (kind === "Gum Snare") tone(220, 0.4, "triangle", 0.15, 160);
    else if (kind === "Jack-in-the-Box") [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.1, "square", 0.08, undefined, i * 0.06));
    else {
      noise(0.18, 0.25, 2200);
      tone(120, 0.2, "square", 0.15, 60);
    }
  },
  caught: () => [0, 0.12].forEach((d) => tone(160, 0.12, "sawtooth", 0.14, 110, d)),
  door: (smash: boolean) => (smash ? (noise(0.35, 0.35, 1800), tone(90, 0.3, "square", 0.2, 50)) : [0, 0.08].forEach((d) => tone(1200, 0.05, "square", 0.06, undefined, d))),
  grab: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.14, "square", 0.08, undefined, i * 0.06)),
  disarm: () => tone(1000, 0.12, "triangle", 0.1, 400),
  win: () => [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.16, "square", 0.09, undefined, i * 0.11)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.22, "triangle", 0.12, undefined, i * 0.16)),
  click: () => tone(660, 0.05, "square", 0.05),
};

/** A quiet sneaky bassline loop for raids. */
export function startMusic() {
  const a = audio();
  if (!a || !master || music) return;
  const bass = [110, 110, 131, 110, 147, 131, 110, 98];
  let i = 0;
  const id = window.setInterval(() => {
    if (muted) return;
    tone(bass[i % bass.length]!, 0.22, "triangle", 0.06);
    if (i % 4 === 2) noise(0.03, 0.03, 4000);
    i++;
  }, 260);
  music = { stop: () => window.clearInterval(id) };
}

export function stopMusic() {
  music?.stop();
  music = null;
}
