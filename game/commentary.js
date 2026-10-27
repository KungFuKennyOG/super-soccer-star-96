// The commentator: a British TV voice (pre-recorded lines in game/assets/voice, rendered by
// tools/build-voice.py) and the words as a subtitle at the bottom of your view. rules/commentary.js
// decides what gets said; this plays it. mode: 0 off, 1 text only, 2 voice and text.
import * as THREE from 'three';
import { ps1, pixelTex, canvasTex } from './ps1.js';
import { drawText, textWidth } from './tex.js';
import { audioOut } from './audio.js';
import { pickLine } from '../rules/commentary.js';

const BASE = new URL('./assets/voice/', import.meta.url);

export function createCommentary(camera) {
  let text = {}, mode = 2, recent = [], current = null, subT = 0;
  const buffers = new Map(), loading = new Map();
  fetch(new URL('lines.json', BASE)).then(r => r.json()).then(j => { for (const [id, t] of j.lines) text[id] = t; }).catch(() => {});

  // the subtitle strip, a little below the middle of your view
  const W = 224, H = 14;
  const c = canvasTex(W, H, () => {});
  const ctx = c.getContext('2d'), tex = pixelTex(c);
  const sub = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.04), ps1({ map: tex, lit: false, transparent: true, depthTest: false, depthWrite: false, fog: false }));
  sub.renderOrder = 24; sub.position.set(0, -0.11, -0.72); sub.rotation.x = 0.15; sub.visible = false;
  camera.add(sub);
  function showText(s) {
    ctx.clearRect(0, 0, W, H);
    let line = s;
    while (textWidth(line) > W - 8 && line.length) line = line.slice(0, -1);
    const tw = textWidth(line), x = Math.round((W - tw) / 2);
    ctx.fillStyle = 'rgba(5,8,40,0.82)'; ctx.fillRect(x - 4, 1, tw + 8, H - 2);
    ctx.fillStyle = '#f2c21a'; ctx.fillRect(x - 4, H - 2, tw + 8, 1);
    drawText(ctx, line, x, 3, '#ffffff');
    tex.needsUpdate = true;
    sub.visible = true;
  }

  function load(id) {
    const out = audioOut();
    if (!out) return Promise.resolve(null);
    if (buffers.has(id)) return Promise.resolve(buffers.get(id));
    if (!loading.has(id)) {
      loading.set(id, fetch(new URL(`${id}.mp3`, BASE)).then(r => r.arrayBuffer()).then(a => out.ctx.decodeAudioData(a))
        .then(b => { buffers.set(id, b); return b; }).catch(() => null));
    }
    return loading.get(id);
  }

  function play(id) {
    const out = audioOut();
    const b = buffers.get(id);
    if (!out || !b) { load(id); return 1.4; }               // not loaded yet: words only this time
    const src = out.ctx.createBufferSource(), g = out.ctx.createGain();
    src.buffer = b; g.gain.value = 1.7;
    src.connect(g).connect(out.master || out.ctx.destination);
    src.start();
    current = { ...current, src };
    return b.duration;
  }

  function say(line) {
    if (!line || !mode) return;
    if (current && current.until > performance.now() && current.priority >= line.priority) return;
    if (current && current.src) { try { current.src.stop(); } catch (e) { /* already ended */ } }
    current = { priority: line.priority, until: 0 };
    const dur = mode === 2 ? play(line.id) : 1.4;
    current.until = performance.now() + dur * 1000 + 250;
    recent.push(line.id); if (recent.length > 8) recent.shift();
    if (text[line.id]) { showText(text[line.id]); subT = dur + 0.8; }
  }

  return {
    get mode() { return mode; },
    setMode(m) { mode = m; if (!m) { sub.visible = false; if (current && current.src) try { current.src.stop(); } catch (e) { /* ended */ } } },
    // start fetching every line once audio is running, so the first goal isn't silent
    preload(ids) { for (const id of ids) load(id); },
    // e: a sim event or { type: 'kickoff' | 'last10' | 'fulltime' | 'combo' | 'counterGoal' }; state for goals
    event(e, state) { say(pickLine(e, state, Math.random, recent)); },
    update(dt) { if (subT > 0 && (subT -= dt) <= 0) sub.visible = false; },
    hideFor(on) { sub.visible = on ? false : subT > 0; },
    mesh: sub,
  };
}
