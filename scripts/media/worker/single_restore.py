"""Complete one restoration in its worker process, including the CPU tail.

On 8 GB cards, restoration and Whisper use the GPU sequentially. Process
exit releases all model/cache allocations; the container daemon admits other
recordings while this one guards, aligns and encodes.
"""
import gc, glob, json, os, sys, time, contextlib
sys.path.insert(0, '/opt/sifter/media')
import runpod_worker as worker

def why_incomplete(d, post):
    """The reason travels in the error: the job dir is scrubbed after a failure (10-31: whole-2185 failed twice, reason lost)."""
    err = os.path.join(d, 'post.error.txt')
    if os.path.exists(err): return open(err).read()[-1200:]
    if not post: return 'post step wrote no post.json'
    return json.dumps({k: post.get(k) for k in ('ok', 'held', 'web', 'reason', 'error', 'verdict', 'guard') if k in post})[-1200:]

def post_only(d):
    from worker.gpu_lease import lease
    done = json.load(open(os.path.join(d, 'restore-result.json')))
    with open(os.path.join(d, 'progress.json'), 'w') as f:
        json.dump({'stage':'guard','at':time.time()},f)
    worker.finalize(d, done)
    post_file = os.path.join(d, 'post.json')
    post = json.load(open(post_file)) if os.path.exists(post_file) else None
    if not post or not post.get('ok') or not (post.get('held') or post.get('web')):
        raise RuntimeError('Incomplete restoration result; no publication: ' + why_incomplete(d, post))
    with open(os.path.join(d, 'progress.json'), 'w') as f:
        json.dump({'stage':'complete','at':time.time()},f)

def main(d):
    cfg = json.load(open(os.path.join(d, 'job.json'))).get('post') or {}
    if cfg.get('mode') == 'post':
        # Cached restoration: no model loading and no CUDA requirement. Boss
        # can perform this entire tail using the identical image on its CPU.
        done={'mode':'post','audio_s':cfg.get('audio_s'),'seconds':0}
        with open(os.path.join(d,'restore-result.json'),'w') as f:json.dump(done,f)
        return post_only(d)
    import torch
    os.environ['HF_HUB_OFFLINE'] = '1'; os.environ['TRANSFORMERS_OFFLINE'] = '1'
    from worker.language_data import prepare
    prepare()
    os.environ['TORCH_HOME'] = '/root/.cache/torch'; torch.set_num_threads(2)
    def stage(name):
        tmp = os.path.join(d, 'progress.json.tmp')
        with open(tmp, 'w') as f: json.dump({'stage': name, 'at': time.time()}, f)
        os.replace(tmp, os.path.join(d, 'progress.json'))
    stage('unipase')
    # NVML admission must precede CUDA initialization. Pending processes that
    # create contexts first can consume the headroom they are all waiting for.
    from worker.gpu_lease import lease
    with contextlib.ExitStack() as phase:
        phase.enter_context(lease('unipase'))
        up, inference, asr = worker.load_models('/opt/unipase', '/opt/models/weights', asr_device='deferred')
        worker.ASR_MODEL['asr'] = asr
        def restore_finished():
            phase.close()
            stage('restore_asr')
            phase.enter_context(lease('restore_asr'))
        done = worker.run_job(d, up, inference, asr, release_restore=restore_finished)
        cfg = json.load(open(os.path.join(d, 'job.json'))).get('post') or {}
        if not cfg.get('cleanup', True):
            worker.ASR_MODEL.clear()
            del asr
        del up; gc.collect(); torch.cuda.empty_cache()
    if not cfg.get('cleanup', True):
        # CUDA/torch and libc can retain gigabytes even after model deletion.
        # Replace our own process before the CPU tail, releasing every allocator
        # and GPU context without interrupting another recording.
        with open(os.path.join(d, 'restore-result.json'), 'w') as f:json.dump(done,f)
        os.execve(sys.executable,[sys.executable,__file__,'--post',d],dict(os.environ))
    stage('guard')
    worker.finalize(d, done)
    post_file = os.path.join(d, 'post.json')
    post = json.load(open(post_file)) if os.path.exists(post_file) else None
    if not post or not post.get('ok') or not (post.get('held') or post.get('web')):
        raise RuntimeError('Incomplete restoration result; no publication: ' + why_incomplete(d, post))
    stage('complete')

if __name__ == '__main__':
    if sys.argv[1]=='--post':post_only(os.path.abspath(sys.argv[2]))
    else:main(os.path.abspath(sys.argv[1]))
