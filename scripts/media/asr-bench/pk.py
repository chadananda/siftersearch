import sys,json,time,resource,numpy as np,sherpa_onnx
D="/mnt/data4tb/asr-bench"; M=D+"/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8"
th=int(sys.argv[1]); clips=sys.argv[2:]
r=sherpa_onnx.OfflineRecognizer.from_transducer(encoder=M+"/encoder.int8.onnx",decoder=M+"/decoder.int8.onnx",joiner=M+"/joiner.int8.onnx",tokens=M+"/tokens.txt",num_threads=th,model_type="nemo_transducer",decoding_method="greedy_search")
for c in clips:
    a=np.frombuffer(open(f"{D}/{c}.wav","rb").read()[44:],dtype=np.int16).astype(np.float32)/32768
    t=time.time(); W=[]
    for i in range(0,len(a)-16000,16000*60):
        s=r.create_stream(); s.accept_waveform(16000,a[i:i+16000*60]); r.decode_stream(s); R=s.result
        cur=None
        for tk,ts in zip(R.tokens,R.timestamps):
            if tk.startswith("▁") or cur is None:
                if cur: W.append(cur)
                cur={"w":tk.lstrip("▁"),"s":i/16000+ts,"e":i/16000+ts}
            else: cur["w"]+=tk
        if cur: W.append(cur)
    dt=time.time()-t
    json.dump({"engine":"parakeet-v3-int8-cpu","clip":c,"wall_s":dt,"audio_s":600,"rtf":dt/600,"maxrss_mb":resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024,"words":W},open(f"{D}/out/pk_{c}.json","w"),ensure_ascii=False)
    print(c,round(dt,1),flush=True)
