"""Complete one restoration in its worker process, including the CPU tail.

On 8 GB cards, restoration and Whisper use the GPU sequentially. Process
exit releases all model/cache allocations; the container daemon admits other
recordings while this one guards, aligns and encodes.
"""
import gc, glob, json, os, sys, time
sys.path.insert(0, '/opt/sifter/media')
import runpod_worker as worker

def main(d):
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
    small = torch.cuda.get_device_properties(0).total_memory < 12 * 2**30
    required = (6.5 if small else 8) * 2**30
    deadline = time.time() + 1800
    while torch.cuda.mem_get_info()[0] < required:
        if time.time() > deadline: raise RuntimeError('GPU headroom did not become available')
        time.sleep(5)
    from worker.gpu_lease import lease
    with lease('unipase'):
        up, inference, asr = worker.load_models('/opt/unipase', '/opt/models/weights', asr_device='deferred' if small else 'cuda')
        worker.ASR_MODEL['asr'] = asr
        done = worker.run_job(d, up, inference, asr)
        cfg = json.load(open(os.path.join(d, 'job.json'))).get('post') or {}
        if not cfg.get('cleanup', True):
            worker.ASR_MODEL.clear()
            del asr
        del up; gc.collect(); torch.cuda.empty_cache()
    stage('guard'); worker.finalize(d, done)
    post_file = os.path.join(d, 'post.json')
    post = json.load(open(post_file)) if os.path.exists(post_file) else None
    if not post or not post.get('ok') or not (post.get('held') or post.get('web')):
        raise RuntimeError('Incomplete restoration result; no publication')
    stage('complete')

if __name__ == '__main__': main(os.path.abspath(sys.argv[1]))
