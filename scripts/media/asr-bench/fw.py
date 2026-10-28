# faster-whisper CPU int8 baseline: python fw.py <model> <threads> <clip...>
import sys,json,time,resource,os
os.environ["HF_HUB_OFFLINE"]="1"
import numpy as np
from faster_whisper import WhisperModel
rd=lambda c: np.frombuffer(open(f"/mnt/data4tb/asr-bench/{c}.wav","rb").read()[44:],dtype=np.int16).astype(np.float32)/32768
model,th,clips=sys.argv[1],int(sys.argv[2]),sys.argv[3:]
t=time.time(); m=WhisperModel(model,device="cpu",compute_type="int8",cpu_threads=th); load=time.time()-t
LANG={"fa":"fa","interp":None}
for c in clips:
    t=time.time()
    segs,info=m.transcribe(rd(c),language=LANG.get(c,"en"),beam_size=1,word_timestamps=True,condition_on_previous_text=False,vad_filter=False)
    W=[{"w":w.word.strip(),"s":w.start,"e":w.end} for s in segs for w in s.words]
    dt=time.time()-t
    json.dump({"engine":"fw-cpu-int8-"+model,"clip":c,"wall_s":dt,"audio_s":600,"rtf":dt/600,"load_s":load,"maxrss_mb":resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024,"words":W},open(f"/mnt/data4tb/asr-bench/out/fwcpu_{c}.json","w"),ensure_ascii=False)
    print(c,round(dt),flush=True)
