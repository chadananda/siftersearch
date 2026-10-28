import sys,time,resource,numpy as np
sys.modules["torchvision"]=None
import torch
from transformers import Wav2Vec2ForCTC
a=np.frombuffer(open("fa.wav","rb").read()[78:],dtype=np.int16).astype(np.float32)/32768
m=Wav2Vec2ForCTC.from_pretrained("jonatasgrosman/wav2vec2-large-xlsr-53-persian").to("cuda").eval()
t=time.time(); n=0
with torch.no_grad():
    for i in range(0,len(a),16000*30):
        x=torch.from_numpy(a[i:i+16000*30]); x=((x-x.mean())/(x.std()+1e-7))[None].cuda()
        n+=m(x).logits.shape[1]
torch.cuda.synchronize(); print("frames",n,"gpu_s",round(time.time()-t,2),"rss_mb",round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024),"vram_gb",round(torch.cuda.max_memory_allocated()/2**30,2))
