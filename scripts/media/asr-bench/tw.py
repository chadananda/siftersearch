# torch ROCm whisper, fp16, 30 s windows batched, token timestamps (cross-attn DTW): python tw.py <hf-model> <tag> <batch> <clip...>
import sys, os, json, time, resource
sys.modules['torchvision'] = None  # rocm venv torchvision is a CPU build that breaks the transformers import
import torch, numpy as np
from transformers import WhisperProcessor, WhisperForConditionalGeneration
mid, tag, bs, clips = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4:]
D = "/mnt/data4tb/asr-bench"
t = time.time()
proc = WhisperProcessor.from_pretrained(mid)
m = WhisperForConditionalGeneration.from_pretrained(mid, torch_dtype=torch.float16).to("cuda:0").eval()
load = time.time() - t
LANG = {"fa": "persian", "interp": None}
for c in clips:
    a = np.frombuffer(open(f"{D}/{c}.wav", "rb").read()[44:], dtype=np.int16).astype(np.float32) / 32768
    wins = [a[i:i + 480000] for i in range(0, len(a), 480000)]
    torch.cuda.reset_peak_memory_stats(); torch.cuda.synchronize(); t = time.time()
    W = []
    for b in range(0, len(wins), bs):
        feats = proc.feature_extractor(wins[b:b + bs], sampling_rate=16000, return_tensors="pt").input_features.to("cuda:0", torch.float16)
        TS = os.environ.get("TS", "1") == "1"
        kw = dict(task="transcribe", num_beams=1, return_token_timestamps=TS, return_dict_in_generate=True)
        lg = LANG.get(c, "english")
        if lg: kw["language"] = lg
        o = m.generate(feats, **kw)
        for j, (seq, ts) in enumerate(zip(o.sequences, o.token_timestamps if TS else [torch.zeros(len(q)) for q in o.sequences])):
            base = (b + j) * 30.0
            cur = None
            toks = proc.tokenizer.convert_ids_to_tokens(seq.tolist())
            n = min(len(toks), len(ts))
            for k in range(n):
                tk = toks[k]
                if tk.startswith("<|"): continue
                txt = proc.tokenizer.convert_tokens_to_string([tk])
                st = base + float(ts[k])
                if cur is None or txt.startswith(" "):
                    if cur: W.append(cur)
                    cur = {"w": txt.strip(), "s": st, "e": st}
                else:
                    cur["w"] += txt
                cur["e"] = base + float(ts[k + 1]) if k + 1 < n else st
            if cur: W.append(cur)
    torch.cuda.synchronize(); dt = time.time() - t
    json.dump({"engine": tag, "clip": c, "wall_s": dt, "audio_s": 600, "rtf": dt / 600, "load_s": load,
               "vram_peak_gb": torch.cuda.max_memory_allocated() / 2**30,
               "maxrss_mb": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024,
               "words": [w for w in W if w["w"]]}, open(f"{D}/out/{tag}_{c}.json", "w"), ensure_ascii=False)
    print(c, round(dt, 1), flush=True)
