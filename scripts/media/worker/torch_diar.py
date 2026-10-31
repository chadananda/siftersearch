# GPU speaker models for hosts whose onnxruntime has no GPU provider (AMD/ROCm: sherpa-onnx is CPU-only there). The SAME ONNX
# files sherpa uses, converted to torch (onnx2torch + an LSTM converter) and run on torch's GPU; diarize() is a line-for-line port
# of sherpa-onnx's OfflineSpeakerDiarizationPyannoteImpl (segmentation → exclusive-speaker embeddings → complete-linkage cosine
# clustering → overlap-add relabel → top-k per frame → segments). Deps: torch, torchaudio, onnx, onnx2torch, onnxsim, scipy.
import os, sys, types
import numpy as np

SR = 16000
_cache = {}


def _stub_torchvision():
    """onnx2torch imports torchvision for NMS/RoIAlign converters these models never use; the ROCm venv has no torchvision."""
    try:
        import torchvision  # noqa: F401
    except Exception:
        tv = types.ModuleType('torchvision'); tv.__path__ = []
        ops = types.ModuleType('torchvision.ops'); ops.nms = ops.batched_nms = ops.roi_align = None
        tv.ops = ops; sys.modules['torchvision'] = tv; sys.modules['torchvision.ops'] = ops


def _register_lstm():
    import torch
    from onnx2torch.node_converters.registry import add_converter, _CONVERTER_REGISTRY
    from onnx2torch.utils.common import OperationConverterResult, OnnxMapping

    class OnnxLSTM(torch.nn.Module):
        """ONNX LSTM (layout 0: X [T, B, I] → Y [T, dirs, B, H], Y_h, Y_c) on torch.nn.LSTM."""
        def __init__(self, lstm, dirs, n_out):
            super().__init__(); self.lstm, self.dirs, self.n_out = lstm, dirs, n_out

        def forward(self, x, *_):
            y, (h, c) = self.lstm(x)
            T, B, _ = y.shape
            y = y.reshape(T, B, self.dirs, -1).permute(0, 2, 1, 3)
            return (y, h, c)[: self.n_out] if self.n_out > 1 else y

    def conv(node, graph):
        a = node.attributes
        H = a['hidden_size']; dirs = 2 if a.get('direction', 'forward') == 'bidirectional' else 1
        ins = list(node.input_values)
        W = graph.initializers[ins[1]].to_torch(); R = graph.initializers[ins[2]].to_torch()
        Bv = graph.initializers[ins[3]].to_torch() if len(ins) > 3 and ins[3] else torch.zeros(dirs, 8 * H)
        lstm = torch.nn.LSTM(W.shape[2], H, bidirectional=dirs == 2)
        order = lambda m: torch.cat([m[0:H], m[2 * H:3 * H], m[3 * H:4 * H], m[H:2 * H]])   # ONNX i,o,f,c → torch i,f,g,o
        with torch.no_grad():
            for d in range(dirs):
                sfx = '_reverse' if d else ''
                getattr(lstm, f'weight_ih_l0{sfx}').copy_(order(W[d])); getattr(lstm, f'weight_hh_l0{sfx}').copy_(order(R[d]))
                getattr(lstm, f'bias_ih_l0{sfx}').copy_(order(Bv[d][:4 * H])); getattr(lstm, f'bias_hh_l0{sfx}').copy_(order(Bv[d][4 * H:]))
        outs = tuple(o for o in node.output_values if o)
        return OperationConverterResult(torch_module=OnnxLSTM(lstm, dirs, len(outs)), onnx_mapping=OnnxMapping(inputs=(ins[0],), outputs=outs))

    for v in (1, 7, 14, 22):
        try:
            add_converter(operation_type='LSTM', version=v)(conv)
        except ValueError:
            pass   # already registered (second load in one process)


def onnx_torch(path, fixed=None):
    """An ONNX file as a torch module on the GPU, in eval mode. fixed: input shape to constant-fold control flow (the
    segmentation model's If) — then every call must use exactly that shape."""
    key = (path, tuple(fixed or ()))
    if key in _cache:
        return _cache[key]
    import onnx, torch
    _stub_torchvision()
    from onnx2torch import convert
    _register_lstm()
    m = onnx.load(path)
    if fixed:
        import onnxsim
        m, ok = onnxsim.simplify(m, overwrite_input_shapes={m.graph.input[0].name: list(fixed)})
        if not ok:
            raise RuntimeError(f'onnxsim could not validate {os.path.basename(path)}')
    t = convert(m).eval().to(gpu())
    _cache[key] = t
    return t


def gpu():
    import torch
    if not torch.cuda.is_available():
        raise RuntimeError('torch speaker models need a GPU (torch.cuda unavailable) — no CPU fallback')
    return torch.device('cuda')


def meta(path):
    import onnx
    return {p.key: p.value for p in onnx.load(path, load_external_data=False).metadata_props}


def fbank(x):
    """sherpa's speaker frontend (kaldi-native-fbank defaults): 80 mel bins, 25/10 ms povey window, preemph 0.97, DC removed,
    20 Hz … Nyquist−400, no dither, samples ×32768 (normalize_samples=0 models), snip_edges=False. x: 1-D float32 at 16 kHz."""
    import torch, torchaudio
    w = torch.as_tensor(x, dtype=torch.float32, device=gpu()).unsqueeze(0) * 32768.0
    return torchaudio.compliance.kaldi.fbank(w, num_mel_bins=80, frame_length=25.0, frame_shift=10.0, dither=0.0, energy_floor=0.0,
                                             preemphasis_coefficient=0.97, remove_dc_offset=True, window_type='povey', low_freq=20.0,
                                             high_freq=-400.0, snip_edges=False, sample_frequency=SR)


class Embedder:
    """WeSpeaker-style (fbank → embs) ONNX model on the GPU; one clip per call (stats pooling: padding would change the vector)."""
    def __init__(self, path):
        self.m = onnx_torch(path)

    def __call__(self, x):
        import torch
        with torch.inference_mode():
            f = fbank(x)
            if f.shape[0] < 1:
                return None
            return self.m(f.unsqueeze(0))[0].float().cpu().numpy()


def _powerset(num_classes=7, num_speakers=3):
    m = np.zeros((num_classes, num_speakers), dtype=np.int32); k = 1
    for j in range(num_speakers):
        m[k, j] = 1; k += 1
    for j in range(num_speakers):
        for l in range(j + 1, num_speakers):
            m[k, j] = m[k, l] = 1; k += 1
    return m


def _segment(audio, seg_path, ws, shift, batch=16):
    """sherpa RunSpeakerSegmentationModel: full windows every `shift` samples + a zero-padded last chunk → logits per chunk."""
    import torch
    n = len(audio)
    if n <= ws:
        chunks = [np.pad(audio, (0, ws - n))]
    else:
        num = (n - ws) // shift + 1
        chunks = [audio[i * shift:i * shift + ws] for i in range(num)]
        if (n - ws) % shift > 0:
            p = num * shift
            chunks.append(np.pad(audio[p:], (0, ws - (n - p))))
    model = onnx_torch(seg_path, fixed=(batch, 1, ws))
    out = []
    with torch.inference_mode():
        for b in range(0, len(chunks), batch):
            part = chunks[b:b + batch]
            x = np.zeros((batch, 1, ws), dtype=np.float32)
            for i, c in enumerate(part):
                x[i, 0] = c
            y = model(torch.from_numpy(x).to(gpu()))
            out.extend(y[:len(part)].float().cpu().numpy())
    return out


def _complete_linkage(E, threshold, num_clusters):
    """sherpa FastClustering: rows L2-normalised, cosine dissimilarity clipped at 0, complete linkage, cut by distance
    (or k); labels numbered by first appearance, as fastcluster's cutree does."""
    from scipy.cluster.hierarchy import linkage, fcluster
    from scipy.spatial.distance import pdist
    if len(E) == 1:
        return np.zeros(1, dtype=np.int32)
    E = E / (np.linalg.norm(E, axis=1, keepdims=True) + 1e-12)
    d = np.clip(pdist(E.astype(np.float64), 'cosine'), 0, None)
    Z = linkage(d, method='complete')
    raw = fcluster(Z, num_clusters, 'maxclust') if num_clusters > 0 else fcluster(Z, threshold, 'distance')
    seen = {}
    return np.array([seen.setdefault(r, len(seen)) for r in raw], dtype=np.int32)


def diarize(audio, models_dir, emb_name, num_speakers=-1, threshold=0.5, min_on=0.3, min_off=0.5):
    """sherpa-onnx OfflineSpeakerDiarization (pyannote-segmentation-3.0 + speaker embedding), ported. → [{start, end, speaker}]"""
    seg_path = os.path.join(models_dir, 'sherpa-onnx-pyannote-segmentation-3-0', 'model.onnx')
    md = meta(seg_path)
    ws, rf_shift, rf_size = int(md['window_size']), int(md['receptive_field_shift']), int(md['receptive_field_size'])
    shift = int(0.1 * ws)
    P = _powerset(int(md['num_classes']), int(md['num_speakers']))
    n = len(audio)
    labels = [P[np.argmax(lg, axis=1)] for lg in _segment(audio, seg_path, ws, shift)]
    has_last = n > ws and (n - ws) % shift > 0

    def frames_total(k):
        return (ws + (k - 1) * shift) // rf_shift + 1

    def result(final):
        scale, off = rf_shift / SR, 0.5 * rf_size / SR
        segs = []
        for s in range(final.shape[1]):
            col, cur = final[:, s], []
            active = col[0] > 0; st = 0 if active else -1
            for f in range(1, len(col)):
                if active and col[f] == 0:
                    cur.append([st * scale + off, f * scale + off]); active = False
                elif not active and col[f] == 1:
                    active = True; st = f
            if active:
                cur.append([st * scale + off, (len(col) - 1) * scale + off])
            merged = True
            while merged:   # sherpa MergeSegments: join neighbours whose gap ≤ min_off
                merged = False
                for i in range(len(cur) - 1):
                    if cur[i][1] < cur[i + 1][0] and cur[i][1] + min_off >= cur[i + 1][0]:
                        cur[i] = [cur[i][0], cur[i + 1][1]]; del cur[i + 1]; merged = True; break
            segs += [{'start': a, 'end': b, 'speaker': s} for a, b in cur if b - a > min_on]
        return sorted(segs, key=lambda r: r['start'])

    if len(labels) == 1:
        final = labels[0]
        if (n - ws) % shift > 0:
            final = final[:min(n // rf_shift, len(final))]
        return result(final)
    # speakers per frame (overlap-add of the local counts)
    T = frames_total(len(labels))
    cnt, wt = np.zeros(T, dtype=np.float32), np.zeros(T, dtype=np.float32)
    for i, L in enumerate(labels):
        st = int(round(i * shift / rf_shift))
        cnt[st:st + len(L)] += L.sum(1); wt[st:st + len(L)] += 1
    per_frame = (cnt / (wt + 1e-12) + 0.5).astype(np.int32)
    if per_frame.max() == 0:
        return []
    # each (chunk, local speaker) with ≥ 10 exclusive frames → its sample spans → one embedding
    pairs, spans = [], []
    for ci, L in enumerate(labels):
        ex = np.where((L.sum(1) < 2)[:, None], L, 0)
        nf, off = len(ex), ci * shift
        for s in range(ex.shape[1]):
            d = ex[:, s]
            if d.sum() < 10:
                continue
            sp, active, st = [], False, 0
            for k in range(nf):
                if d[k]:
                    if not active:
                        active, st = True, k
                elif active:
                    active = False; sp.append((int(st / nf * ws + off), int(k / nf * ws + off)))
            if active:
                sp.append((int(st / nf * ws + off), int((nf - 1) / nf * ws + off)))
            pairs.append((ci, s)); spans.append(sp)
    emb = Embedder(os.path.join(models_dir, emb_name))
    E, keep = [], []
    for i, sp in enumerate(spans):
        x = np.concatenate([audio[a:min(b, n)] for a, b in sp if min(b, n) > a] or [np.zeros(0, np.float32)])
        v = emb(x) if len(x) else None
        if v is not None and not np.isnan(v).any():
            E.append(v); keep.append(i)
    if not E:
        return []
    cl = _complete_linkage(np.stack(E), threshold, num_speakers)
    to_cluster = {pairs[i]: int(c) for i, c in zip(keep, cl)}
    K = int(cl.max()) + 1
    count = np.zeros((T, K), dtype=np.int32)
    for ci, L in enumerate(labels):
        R = np.zeros((len(L), K), dtype=np.int32)
        for s in range(L.shape[1]):
            c = to_cluster.get((ci, s))
            if c is not None:
                R[L[:, s] == 1, c] = 1
        st = int(round(ci * shift / rf_shift))
        count[st:st + len(L)] += R
    if has_last:
        count = count[:min(n // rf_shift, T - 1) + 1]
    final = np.zeros_like(count)
    for f in range(len(count)):
        k = per_frame[f]
        if k:
            final[f, np.argsort(-count[f], kind='stable')[:k]] = 1
    return result(final)
