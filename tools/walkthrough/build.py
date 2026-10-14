import json, os, subprocess, re, soundfile as sf
FF = os.environ.get('FFMPEG', 'ffmpeg')
D = json.load(open('durations.json')); IDS = ['s1', 's2', 's3', 's4', 's5']; X = 0.5
def run(a): subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-y'] + a, check=True)
os.makedirs('out', exist_ok=True)
import sys
ONLY_CAPS = 'caps' in sys.argv
for sid in ([] if ONLY_CAPS else IDS):
    m = json.load(open(f'frames/{sid}/frames.json')); fr = m['frames']; t0, t1 = m['t0'], m['t1']
    with open(f'frames/{sid}/list.txt', 'w') as f:
        for i, x in enumerate(fr):
            start = 0 if i == 0 else x['t'] - t0
            end = (fr[i + 1]['t'] - t0) if i + 1 < len(fr) else (t1 - t0)
            f.write(f"file '{os.path.abspath(x['file'])}'\nduration {max(0.001, end - start):.4f}\n")
        f.write(f"file '{os.path.abspath(fr[-1]['file'])}'\n")
    run(['-f', 'concat', '-safe', '0', '-i', f'frames/{sid}/list.txt', '-vf', 'fps=30,scale=1280:720:flags=lanczos,format=yuv420p', '-t', str(D[sid]), '-c:v', 'libx264', '-crf', '10', '-preset', 'veryfast', f'out/{sid}.mp4'])
# Crossfaded timeline.
starts = [0.0]; off = 0.0
for sid in IDS[:-1]:
    off += D[sid] - X; starts.append(off)
total = starts[-1] + D[IDS[-1]]
inputs = sum([['-i', f'out/{s}.mp4'] for s in IDS], [])
fc = []; last = '[0:v]'
for i in range(1, len(IDS)):
    fc.append(f"{last}[{i}:v]xfade=transition=fade:duration={X}:offset={starts[i]:.3f}[v{i}]"); last = f'[v{i}]'
fc.append(f"{last}fade=t=in:st=0:d=0.4,fade=t=out:st={total - 0.6:.3f}:d=0.6[vout]")
# Voice-over: each scene's narration starts shortly after the scene does.
lead = [0.6, 0.5, 0.5, 0.5, 0.5]; vo_in = []
for i, s in enumerate(IDS):
    vo_in += ['-i', f'vo_{s}.wav']
n = len(IDS)
for i in range(n):
    ms = int((starts[i] + lead[i]) * 1000)
    fc.append(f"[{n + i}:a]aresample=48000,adelay={ms}|{ms},apad[a{i}]")
fc.append(''.join(f'[a{i}]' for i in range(n)) + f"amix=inputs={n}:normalize=0:duration=longest,atrim=0:{total:.3f},loudnorm=I=-16:TP=-1.5:LRA=11[voice]")
# Quiet ambient bed, synthesized here (no third-party music): a soft A-major pad.
fc.append(f"sine=f=110:d={total:.3f},volume=0.5[p1];sine=f=164.81:d={total:.3f},volume=0.35[p2];sine=f=220:d={total:.3f},volume=0.3[p3];sine=f=277.18:d={total:.3f},volume=0.18[p4];"
          f"[p1][p2][p3][p4]amix=inputs=4:normalize=0,tremolo=f=0.18:d=0.35,lowpass=f=900,volume=0.045,afade=t=in:d=2,afade=t=out:st={total - 2.5:.3f}:d=2.5,aresample=48000[bed]")
fc.append("[voice][bed]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[aout]")
if not ONLY_CAPS: run(inputs + vo_in + ['-filter_complex', ';'.join(fc), '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '25', '-profile:v', 'high', '-level', '4.0', '-pix_fmt', 'yuv420p', '-r', '30', '-g', '60',
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '48000', '-movflags', '+faststart', '-t', f'{total:.3f}', 'out/how-it-works.mp4'])
# Poster (from the brand introduction) and a captions track.
if not ONLY_CAPS: run(['-ss', '3.6', '-i', 'out/how-it-works.mp4', '-frames:v', '1', '-q:v', '3', 'out/poster.jpg'])
scenes = json.load(open('scenes.json'))
def ts(t): return f"{int(t // 3600):02d}:{int(t % 3600 // 60):02d}:{t % 60:06.3f}"
cues = []
for i, s in enumerate(scenes):
    a, sr = sf.read(f"vo_{s['id']}.wav"); dur = len(a) / sr; st = starts[i] + lead[i]
    text = s['text'].replace('Tarafab X A I', 'Tarafab.XAi').replace('X A I', 'XAI')
    parts = []
    for sent in [p.strip() for p in re.split(r'(?<=[.!?])\s+', text) if p.strip()]:
        # Long sentences become two cues, split at the comma nearest the middle.
        if len(sent) > 84 and ',' in sent:
            cs = [m.end() for m in re.finditer(',', sent)]; k = min(cs, key=lambda c: abs(c - len(sent) / 2))
            parts += [sent[:k].strip(), sent[k:].strip()]
        else: parts.append(sent)
    tot = sum(len(p) for p in parts); t = st
    for p in parts:
        d = dur * len(p) / tot
        cues.append((t, t + d, p)); t += d
with open('out/how-it-works.en.vtt', 'w') as f:
    f.write('WEBVTT\n\n')
    for k, (a, b, p) in enumerate(cues, 1): f.write(f"{k}\n{ts(a)} --> {ts(b)}\n{p}\n\n")
json.dump({'starts': starts, 'total': total}, open('out/timeline.json', 'w'))
print('total', round(total, 2), 'starts', [round(x, 2) for x in starts])
