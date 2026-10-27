// Chiptune music, sequenced live on WebAudio: an upbeat 90s sports-menu theme and a funky loop for the
// goal dance. Original tunes. playMusic(name) after startAudio() has run from a click or trigger.
import { audioOut } from './audio.js';

const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const midi = n => { const m = n.match(/^([A-G]#?)(\d)$/); return 12 * (+m[2] + 1) + NOTE[m[1]]; };
const freq = m => 440 * Math.pow(2, (m - 69) / 12);
const CHORDS = {
  A: ['A', 'C#', 'E'], 'F#m': ['F#', 'A', 'C#'], D: ['D', 'F#', 'A'], E: ['E', 'G#', 'B'], 'C#m': ['C#', 'E', 'G#'],
  Em: ['E', 'G', 'B'], C: ['C', 'E', 'G'], G: ['G', 'B', 'D'], Bm: ['B', 'D', 'F#'],
};

// Lead lines are 8 eighth notes per bar: a note, '.' to hold, '-' for silence.
const TRACKS = {
  menu: {
    bpm: 138,
    chords: ['A', 'F#m', 'D', 'E', 'D', 'E', ['C#m', 'F#m'], ['D', 'E']],
    lead: [
      'E5 . C#5 E5 A5 . G#5 F#5', 'E5 . C#5 . F#5 E5 C#5 B4', 'A4 . D5 F#5 A5 . F#5 A5', 'G#5 . . E5 F#5 G#5 B5 .',
      'A5 . F#5 . D5 . F#5 A5', 'G#5 . E5 . B4 . E5 G#5', 'G#5 F#5 E5 C#5 F#5 . A5 .', 'F#5 . E5 . B5 . . -',
    ],
    drums: 'K-h-S-h-K-hKS-h-',   // per 16 steps: K kick, S snare, h hat
    arp: true,
  },
  dance: {
    bpm: 104,
    chords: ['Em', 'Em', 'C', 'D'],
    lead: ['- - - - B4 - D5 -', 'E5 . D5 B4 - G4 A4 -', '- - G4 - E5 . D5 -', 'B4 . A4 G4 A4 . B4 -'],
    bassRiff: 'R-RO--R-R-O-R-RO',  // R root, O octave
    drums: 'K-hhC-hhK-hhC-hK',     // C clap
    stabs: true,
  },
};

let out = null, bus = null, timer = null, cur = null, step = 0, nextT = 0, startT = 0;

export function playMusic(name) {
  const a = audioOut();
  if (!a || cur === name) return;
  stopMusic(0.05);
  out = a;
  bus = out.ctx.createGain(); bus.gain.value = 0.2; bus.connect(out.master);
  cur = name; step = 0;
  nextT = startT = out.ctx.currentTime + 0.08;
  timer = setInterval(schedule, 25);
  schedule();
}

export function stopMusic(fade = 0.5) {
  if (!cur) return;
  clearInterval(timer); timer = null;
  const b = bus, t = out.ctx.currentTime;
  b.gain.cancelScheduledValues(t); b.gain.setValueAtTime(b.gain.value, t); b.gain.linearRampToValueAtTime(0.0001, t + fade);
  setTimeout(() => b.disconnect(), (fade + 0.3) * 1000);
  cur = null;
}

export const musicPlaying = () => cur;
// Seconds since the current track's first beat (for syncing the dance to the music).
export const musicTime = () => (out && cur ? out.ctx.currentTime - startT : 0);

function schedule() {
  const tr = TRACKS[cur];
  if (!tr) return;
  const s16 = 60 / tr.bpm / 4, ahead = out.ctx.currentTime + 0.15;
  while (nextT < ahead) { playStep(tr, step, nextT, s16); step++; nextT += s16; }
}

function playStep(tr, n, t, s16) {
  const bars = tr.chords.length, bar = Math.floor(n / 16) % bars, i = n % 16;
  let ch = tr.chords[bar];
  if (Array.isArray(ch)) ch = ch[i < 8 ? 0 : 1];
  const tones = CHORDS[ch], root = tones[0];

  // drums
  const d = tr.drums[i];
  if (d === 'K') kick(t);
  if (d === 'S' || d === 'C') snare(t, d === 'C');
  if (d === 'h' || i % 2 === 0) { if (d !== 'K' && d !== 'S' && d !== 'C') hat(t); }

  // bass
  if (tr.bassRiff) {
    const b = tr.bassRiff[i];
    if (b === 'R' || b === 'O') tone('triangle', freq(midi(root + '2') + (b === 'O' ? 12 : 0)), t, s16 * 1.6, 0.5);
  } else if (i % 2 === 0) {
    tone('triangle', freq(midi(root + (i % 4 === 0 ? '2' : '3'))), t, s16 * 1.8, 0.5);
  }

  // arpeggio
  if (tr.arp) {
    const seq = [0, 1, 2, 1], name = tones[seq[i % 4]];
    tone('square', freq(midi(name + '4') + (seq[i % 4] === 0 && i % 8 === 4 ? 12 : 0)), t, s16 * 0.8, 0.05);
  }
  if (tr.stabs && (i === 2 || i === 10)) for (const nm of tones) tone('square', freq(midi(nm + '4')), t, s16 * 0.9, 0.045);

  // lead: eighth notes on even steps
  if (i % 2 === 0) {
    const toks = tr.lead[bar].split(' '), tok = toks[i / 2];
    if (tok && tok !== '.' && tok !== '-') {
      let len = 1;
      for (let k = i / 2 + 1; k < toks.length && toks[k] === '.'; k++) len++;
      tone('square', freq(midi(tok)), t, s16 * 2 * len * 0.92, 0.14, true);
    }
  }
}

function tone(type, f, t, len, vol, vibrato = false) {
  const { ctx } = out, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (vibrato && len > 0.25) {
    const l = ctx.createOscillator(), lg = ctx.createGain();
    l.frequency.value = 6; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.012, t + len);
    l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + len + 0.05);
  }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.setValueAtTime(vol, t + Math.max(0.01, len - 0.03));
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800;
  o.connect(lp); lp.connect(g); g.connect(bus);
  o.start(t); o.stop(t + len + 0.02);
}

let noise = null;
function noiseBuf() {
  if (noise) return noise;
  const { ctx } = out, b = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return (noise = b);
}
function kick(t) {
  const { ctx } = out, o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.1);
  g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.18);
}
function snare(t, clap) {
  const { ctx } = out, n = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  n.buffer = noiseBuf(); f.type = 'bandpass'; f.frequency.value = clap ? 1400 : 1900; f.Q.value = clap ? 1.5 : 0.7;
  g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (clap ? 0.12 : 0.15));
  n.connect(f); f.connect(g); g.connect(bus); n.start(t); n.stop(t + 0.2);
}
function hat(t) {
  const { ctx } = out, n = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  n.buffer = noiseBuf(); f.type = 'highpass'; f.frequency.value = 7000;
  g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  n.connect(f); f.connect(g); g.connect(bus); n.start(t); n.stop(t + 0.05);
}
