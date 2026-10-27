#!/usr/bin/env python3
"""Renders the commentator's lines (game/assets/voice/lines.json) to game/assets/voice/<id>.mp3.

Dev tooling only. Needs numpy, onnxruntime and ffmpeg, plus the Kokoro v1.0 model files (Apache-2.0),
from the kokoro-onnx releases on GitHub, and the phoneme vocabulary from that repo:
  kokoro-v1.0.onnx, voices-v1.0.bin   (model-files-v1.0)
  config.json                         (src/kokoro_onnx/config.json)

  python3 tools/build-voice.py <dir with the two model files>

The lines carry hand-written phonemes (misaki British set), so no phonemizer is needed. Each line is
rendered, trimmed, and run through a light "90s TV broadcast" filter (band-limited, compressed).
"""
import json, os, subprocess, sys, wave
import numpy as np
import onnxruntime as rt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 24000


def main(model_dir):
    spec = json.load(open(os.path.join(ROOT, 'game/assets/voice/lines.json'), encoding='utf-8'))
    cfg = json.load(open(os.path.join(model_dir, 'config.json'), encoding='utf-8')) if os.path.exists(os.path.join(model_dir, 'config.json')) else None
    vocab = cfg['vocab'] if cfg else None
    sess = rt.InferenceSession(os.path.join(model_dir, 'kokoro-v1.0.onnx'), providers=['CPUExecutionProvider'])
    if vocab is None:
        meta = sess.get_modelmeta().custom_metadata_map
        vocab = json.loads(meta['vocab']) if 'vocab' in meta else None
    voices = np.load(os.path.join(model_dir, 'voices-v1.0.bin'))
    voice = voices[spec['voice']]
    out_dir = os.path.join(ROOT, 'game/assets/voice')
    os.makedirs(out_dir, exist_ok=True)
    tmp = os.path.join(out_dir, '_tmp.wav')
    for lid, text, ph in spec['lines']:
        missing = sorted({c for c in ph if c not in vocab})
        if missing:
            print(f'{lid}: dropping unknown phonemes {missing}')
        ids = [vocab[c] for c in ph if c in vocab]
        tokens = np.array([[0, *ids, 0]], dtype=np.int64)
        style = voice[len(ids)].astype(np.float32)
        audio = sess.run(None, {'tokens': tokens, 'style': style, 'speed': np.array([1.08], dtype=np.float32)})[0]
        audio = np.asarray(audio, dtype=np.float32).reshape(-1)
        # trim silence
        loud = np.where(np.abs(audio) > 0.01)[0]
        if len(loud):
            audio = audio[max(0, loud[0] - 600): loud[-1] + 2400]
        pcm = (np.clip(audio / max(1e-6, np.abs(audio).max()) * 0.92, -1, 1) * 32767).astype(np.int16)
        with wave.open(tmp, 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
        dst = os.path.join(out_dir, f'{lid}.mp3')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp,
                        '-af', 'highpass=f=170,lowpass=f=6500,acompressor=threshold=-18dB:ratio=3:attack=5:release=80,volume=1.4',
                        '-ac', '1', '-ar', '22050', '-b:a', '40k', dst], check=True)
        print(f'{lid}: {len(pcm) / SR:.2f}s  {text}')
    os.remove(tmp)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1])
