import subprocess,time,os,sys
os.environ["LD_LIBRARY_PATH"]="wcpp/build/src:wcpp/build/ggml/src:wcpp/build/ggml/src/ggml-hip:/opt/rocm/lib"
clips=sys.argv[1:]; t=time.time()
ps=[subprocess.Popen([os.path.expanduser("~/media-asr/capped.sh"),"8","wcpp/build/bin/whisper-cli","-m","wcpp/models/ggml-large-v3-turbo.bin","-f",c+".wav","-l","en","-bs","1","-ml","1","-sow","-oj","-of","/tmp/wc_"+c],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL) for c in clips]
mx=0;vm=0
while any(p.poll() is None for p in ps):
    r=sum(int(l.split()[0]) for l in subprocess.run("ps -eo rss,comm | grep whisper-cli",shell=True,capture_output=True,text=True).stdout.splitlines())
    mx=max(mx,r); vm=max(vm,int(open(subprocess.getoutput("ls /sys/class/drm/card*/device/mem_info_vram_used | head -1")).read()))
    time.sleep(1)
print("streams",len(clips),"wall_s",round(time.time()-t),"audio_s",600*len(clips),"peak_rss_mb",mx//1024,"vram_used_gb",round(vm/2**30,1))
