#!/usr/bin/env python3
"""Renders the commentator's lines (game/assets/voice/lines.json) to game/assets/voice/<id>.mp3.

Dev tooling only. Uses Chatterbox TTS (Resemble AI, MIT), which has an excitement dial, with the voice
cloned from a reference clip of the same British man:
  tools/voice-ref.flac      calm (the original Kokoro bm_george commentator), for hype 0 lines
  tools/voice-ref-hot.flac  him hyped up (Chatterbox at high excitement, cloned from the calm one), for the rest
Needs ffmpeg and a Python env with:
  pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
  pip install --no-deps chatterbox-tts
  pip install "numpy>=2" librosa==0.11.0 s3tokenizer transformers==5.2.0 diffusers==0.29.0 \
      resemble-perth conformer==0.3.2 safetensors pyloudnorm omegaconf huggingface_hub soundfile faster-whisper
Models download from Hugging Face on first run. CPU is fine: about 30 s a take.

  python3 tools/build-voice.py [line ids...]        (no ids: render them all)
  python3 tools/build-voice.py --retake <ids...>    (new takes for lines you don't like)

Each line in lines.json is [id, subtitle, what he says, hype, seed]. Hype 0 is calm (full time),
1 lively, 2 a big moment (goals, bicycle kicks). Hot takes sometimes mumble or tack a stray syllable on
the end, so each take is checked with speech recognition (faster-whisper) and retaken with the next
seed until the words match; the seed that passed is written back so a re-run gives the same take.
Every take is trimmed, run through a light "90s TV broadcast" filter (band-limited, compressed) and
loudness-matched, big moments a little hotter.
"""
import difflib, json, os, re, subprocess, sys, zlib
import librosa
import soundfile as sf
import torch
from chatterbox.tts import ChatterboxTTS
from faster_whisper import WhisperModel

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LINES = os.path.join(ROOT, 'game/assets/voice/lines.json')
CALM = os.path.join(ROOT, 'tools/voice-ref.flac')
HOT = os.path.join(ROOT, 'tools/voice-ref-hot.flac')
# per hype level: reference voice, exaggeration (emotion), cfg weight (lower = looser, quicker), loudness.
# Past ~1.0 on the hot voice he starts adding syllables and squeaking.
HYPE = [
    {'ref': CALM, 'ex': 0.5, 'cfg': 0.5, 'lufs': -17},
    {'ref': HOT, 'ex': 0.7, 'cfg': 0.4, 'lufs': -16},
    {'ref': HOT, 'ex': 1.0, 'cfg': 0.3, 'lufs': -15},
]
TRIM = ('silenceremove=start_periods=1:start_threshold=-45dB,areverse,'
        'silenceremove=start_periods=1:start_threshold=-45dB,areverse,apad=pad_dur=0.08')
BROADCAST = 'highpass=f=170,lowpass=f=6500,acompressor=threshold=-18dB:ratio=3:attack=5:release=80'
TAKES = 5


def words(s):
    return re.sub(r"[^a-z ]", ' ', s.lower().replace("'", '')).split()


def score(said, heard, secs):
    """How well a take matches the line: word similarity, minus a penalty for running long."""
    # letters, not words, so "under way" vs "underway" or "full time" vs "full-time" still match
    sim = difflib.SequenceMatcher(None, ''.join(words(said)), ''.join(words(heard))).ratio()
    limit = 0.9 + 0.38 * len(words(said))
    return sim - max(0.0, secs - limit) * 0.3


def save(spec):
    with open(LINES, 'w', encoding='utf-8') as f:
        f.write('{\n  "note": ' + json.dumps(spec['note'], ensure_ascii=False) + ',\n  "lines": [\n' +
                ',\n'.join('    ' + json.dumps(l, ensure_ascii=False) for l in spec['lines']) + '\n  ]\n}\n')


def main(args):
    retake = args[:1] == ['--retake']
    only = set(args[1:] if retake else args)
    spec = json.load(open(LINES, encoding='utf-8'))
    tts = ChatterboxTTS.from_pretrained(device='cuda' if torch.cuda.is_available() else 'cpu')
    asr = WhisperModel('small.en', device='cpu', compute_type='int8')
    out_dir = os.path.join(ROOT, 'game/assets/voice')
    tmp = os.path.join(out_dir, '_tmp.wav')
    for line in spec['lines']:
        lid, text, said, hype = line[:4]
        if only and lid not in only:
            continue
        h = HYPE[hype]
        seed = line[4] if len(line) > 4 else zlib.crc32(lid.encode()) % 10000
        if retake:
            seed += 1
        best = None
        for take in range(TAKES):
            torch.manual_seed(seed + take)
            wav = tts.generate(said, audio_prompt_path=h['ref'], exaggeration=h['ex'], cfg_weight=h['cfg'], temperature=0.8)
            audio = wav.squeeze(0).numpy()
            heard = ' '.join(s.text for s in asr.transcribe(librosa.resample(audio, orig_sr=tts.sr, target_sr=16000), language='en')[0])
            s = score(said, heard, len(audio) / tts.sr)
            if best is None or s > best[0]:
                best = (s, seed + take, audio, heard)
            if s >= 0.8:
                break
        s, used, audio, heard = best
        line[4:] = [used]
        sf.write(tmp, audio, tts.sr)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp,
                        '-af', f"{TRIM},{BROADCAST},loudnorm=I={h['lufs']}:TP=-1.5:LRA=11",
                        '-ac', '1', '-ar', '22050', '-b:a', '48k', os.path.join(out_dir, f'{lid}.mp3')], check=True)
        flag = '' if s >= 0.8 else '   <-- check this one'
        print(f'{lid}: hype {hype} seed {used} {len(audio) / tts.sr:.2f}s  "{said}" heard "{heard.strip()}"{flag}', flush=True)
        save(spec)
    if os.path.exists(tmp):
        os.remove(tmp)


if __name__ == '__main__':
    main(sys.argv[1:])
