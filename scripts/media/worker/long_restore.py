"""UniPASE's 8 s / 4 s long-form recipe with bounded device memory.

The upstream helper retains the full input and every output on CUDA. Keep only
one patch on CUDA and spool output on disk, preserving its overlap trimming.
"""
import os


def patch_bounds(frames, sr):
    seg, hop = 8 * sr, 4 * sr
    bounds = []
    start = 0
    while start < frames:
        end = start + seg
        if end > frames:
            if end - frames < 2 * sr or not bounds:
                bounds.append((start, frames))
            else:
                bounds[-1] = (bounds[-1][0], frames)
            break
        bounds.append((start, end))
        start += hop
    return bounds


def inference_file(input_file, output_file, model, **kwargs):
    import numpy as np
    import soundfile as sf
    import torch
    device = next(model.parameters()).device
    tmp = output_file + '.bounded.wav'
    peak_in = peak_out = 0.0
    with sf.SoundFile(input_file) as source:
        sr, frames = source.samplerate, len(source)
        bounds = patch_bounds(frames, sr)
        if not bounds:
            raise ValueError('empty audio')
        with sf.SoundFile(tmp, 'w', samplerate=sr, channels=1, subtype='FLOAT') as dest:
            for i, (start, end) in enumerate(bounds):
                source.seek(start)
                samples = source.read(end-start, dtype='float32', always_2d=True)[:, 0]
                peak_in = max(peak_in, float(np.max(np.abs(samples))))
                patch = torch.from_numpy(samples.copy())[None].to(device)
                with torch.inference_mode():
                    enhanced = model(patch, sr_in=sr, **kwargs)
                audio = enhanced.detach().cpu().numpy().reshape(-1)
                left = 0 if i == 0 else 2 * sr
                right = len(audio) if i == len(bounds)-1 else 6 * sr
                audio = audio[left:right]
                if not np.isfinite(audio).all():
                    raise ValueError('non-finite restored samples')
                peak_out = max(peak_out, float(np.max(np.abs(audio))))
                dest.write(audio)
                del patch, enhanced
                if i % 25 == 0 or i == len(bounds)-1:
                    print(f'UniPASE patches {i+1}/{len(bounds)}', flush=True)
    with sf.SoundFile(tmp) as source:
        if len(source) != frames:
            raise ValueError(f'restored duration changed: {len(source)} != {frames}')
        with sf.SoundFile(output_file, 'w', samplerate=sr, channels=1, subtype='PCM_16') as dest:
            for block in source.blocks(blocksize=sr*8, dtype='float32'):
                dest.write(block * (peak_in / (peak_out + 1e-8)))
    os.remove(tmp)
