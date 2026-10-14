import json, soundfile as sf
from kokoro_onnx import Kokoro
k = Kokoro('kokoro.int8.onnx', 'voices.bin')
for s in json.load(open('scenes.json')):
    a, sr = k.create(s['text'], voice='af_heart', speed=1.0, lang='en-us')
    sf.write(f"vo_{s['id']}.wav", a, sr)
    print(s['id'], round(len(a)/sr, 2))
