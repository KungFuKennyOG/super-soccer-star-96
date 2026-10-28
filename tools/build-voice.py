#!/usr/bin/env python3
"""Renders the commentator's lines (game/assets/voice/lines.json) to game/assets/voice/<id>.mp3.

Dev tooling only. Needs numpy, onnxruntime and ffmpeg, plus the Kokoro v1.0 model files (Apache-2.0),
from the kokoro-onnx releases on GitHub, and the phoneme vocabulary from that repo:
  kokoro-v1.0.onnx, voices-v1.0.bin   (model-files-v1.0)
  config.json                         (src/kokoro_onnx/config.json)

  python3 tools/build-voice.py <dir with the model files> [line ids...]   (no ids: render them all)

The lines carry hand-written phonemes (misaki British set), so no phonemizer is needed. Each line is
rendered, trimmed, and run through a "90s TV broadcast" filter (band-limited, compressed). A line's
hype (0-2) makes it more excited: delivered faster, pitched up (formants kept, so it sounds like the
same man getting louder, not a chipmunk) and driven hotter into the mic. Long vowels (repeated ː)
and extra !! in the phonemes stretch the big calls ("GOOOAL").
"""
import json, os, subprocess, sys, wave
import numpy as np
import onnxruntime as rt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 24000
BROADCAST = 'highpass=f=170,lowpass=f=6500,acompressor=threshold=-18dB:ratio=3:attack=5:release=80'
# per hype level: speaking speed, pitch (rubberband, formants preserved) and how hot it's driven
HYPE = [
    {'speed': 1.06, 'af': f'{BROADCAST},volume=1.4'},
    {'speed': 1.14, 'af': f'rubberband=pitch=1.05:formant=preserved,{BROADCAST},volume=1.5'},
    {'speed': 1.22, 'af': f'rubberband=pitch=1.12:formant=preserved,volume=2.2,asoftclip=type=tanh,aexciter=amount=2:drive=6,{BROADCAST},acompressor=threshold=-12dB:ratio=6:attack=2:release=60,volume=1.5'},
]


def main(model_dir, only=()):
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
    for lid, text, ph, *rest in spec['lines']:
        hype = rest[0] if rest else 1
        hold = rest[1] if len(rest) > 1 else 0
        if only and lid not in only:
            continue
        missing = sorted({c for c in ph if c not in vocab})
        if missing:
            print(f'{lid}: dropping unknown phonemes {missing}')
        ids = [vocab[c] for c in ph if c in vocab]
        tokens = np.array([[0, *ids, 0]], dtype=np.int64)
        style = voice[len(ids)].astype(np.float32)
        audio = sess.run(None, {'tokens': tokens, 'style': style, 'speed': np.array([HYPE[hype]['speed']], dtype=np.float32)})[0]
        audio = np.asarray(audio, dtype=np.float32).reshape(-1)
        # trim silence
        loud = np.where(np.abs(audio) > 0.01)[0]
        if len(loud):
            audio = audio[max(0, loud[0] - 600): loud[-1] + 2400]
        if hold:
            audio = hold_vowel(audio, hold, tmp)
        pcm = (np.clip(audio / max(1e-6, np.abs(audio).max()) * 0.92, -1, 1) * 32767).astype(np.int16)
        with wave.open(tmp, 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
        dst = os.path.join(out_dir, f'{lid}.mp3')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp,
                        '-af', HYPE[hype]['af'],
                        '-ac', '1', '-ar', '22050', '-b:a', '40k', dst], check=True)
        print(f'{lid}: hype {hype}  {len(pcm) / SR:.2f}s  {text}')
    os.remove(tmp)


def hold_vowel(audio, hold, tmp):
    """Stretches the loudest stretch of the line (its main vowel) to `hold` seconds: "GOOOOOAL"."""
    win, hop = int(0.18 * SR), int(0.01 * SR)
    rms = [np.sqrt(np.mean(audio[i:i + win] ** 2)) for i in range(0, max(1, len(audio) - win), hop)]
    a = int(np.argmax(rms)) * hop
    seg = audio[a:a + win]
    seg_wav, out_wav = tmp + '.seg.wav', tmp + '.held.wav'
    with wave.open(seg_wav, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(seg, -1, 1) * 32767).astype(np.int16).tobytes())
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', seg_wav, '-af', f'rubberband=tempo={win / SR / hold:.4f}:transients=smooth', out_wav], check=True)
    with wave.open(out_wav, 'rb') as w:
        held = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32767
    os.remove(seg_wav); os.remove(out_wav)
    # a slight rise in pitch-energy over the hold: swell the volume toward the end of the vowel
    held = held * np.linspace(0.85, 1.1, len(held))
    fade = int(0.02 * SR)
    left, right = audio[:a + fade].copy(), audio[a + win - fade:].copy()
    ramp = np.linspace(0, 1, fade)
    held[:fade] = held[:fade] * ramp + left[-fade:] * (1 - ramp)
    held[-fade:] = held[-fade:] * (1 - ramp) + right[:fade] * ramp
    return np.concatenate([left[:-fade], held, right[fade:]])


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1], set(sys.argv[2:]))
