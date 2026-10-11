#!/usr/bin/env python3
# Laya fine-tune by distillation from Jev (planning/laya-training-plan-20261010.md, step 1). Per task: minimise
# cross-entropy of Laya's option softmax against Jev's answer distribution (= KL + const) on the exported train split, and
# report agreement with Jev (argmax match, mean KL) on the eval split before and after. Sequences come from laya's own
# Agent._encode_state + collate_items, so training sees exactly what inference sees. No API cost. Deps: laya, torch,
# safetensors. The output directory loads with laya.load(<out>) (weights written into a copy of the base checkpoint).
#   python scripts/laya/finetune.py --train T.train.jsonl --eval T.eval.jsonl --out ~/laya-models/<task>
#          [--epochs 1] [--batch 16] [--lr 2e-5] [--limit N] [--eval-limit 2000] [--device cpu] [--dry]
# Records (scripts/systemone export): {"state": {...}, "questions": {qid: {type, criteria, instructions}}, "gold": {qid: {...}}}
import argparse, json, math, os, random, shutil, time

import torch
import laya
from laya.agent import Agent
from laya.common import collate_items


def read(path, limit=None):
    rows = []
    with open(path, encoding='utf-8') as f:
        for line in f:
            if line.strip():
                rows.append(json.loads(line))
            if limit and len(rows) >= limit:
                break
    return rows


def target_for(internal_q, gold):
    """Jev's distribution in Laya's option order (choice: criteria keys; noul: [false, true]); None if unusable."""
    t = internal_q['t']
    if t == 'choice':
        p = [float((gold or {}).get(k, 0) or 0) for k in internal_q['crit']]
    elif t == 'noul':
        g = gold.get('true', gold.get('yes')) if isinstance(gold, dict) else gold
        if g is None:
            return None
        p = [1.0 - float(g), float(g)]
    else:
        return None                                   # score questions: not in the exports yet
    s = sum(p)
    return [x / s for x in p] if s > 0 else None


def encode(agent, rec):
    """One record → laya items with a soft target each (questions without a usable target are dropped)."""
    qs = rec['questions']
    ids = list(qs)
    internal = {q: Agent._to_internal(qs[q]) for q in ids}
    items = agent._encode_state(rec['state'], ids, internal)
    out = []
    for j, q in enumerate(ids):
        tgt = target_for(internal[q], rec.get('gold', {}).get(q))
        if tgt is None or len(tgt) != len(items[j]['markers']):
            continue                                   # options truncated away, or no Jev answer
        items[j]['target'] = tgt
        out.append(items[j])
    return out


def batches(encoded, size, shuffle):
    order = list(range(len(encoded)))
    if shuffle:
        random.shuffle(order)
    for i in range(0, len(order), size):
        group = [encoded[k] for k in order[i:i + size] if encoded[k]]
        if group:
            yield group


def forward(agent, b):
    dev = agent.device
    logits, _act = agent.model(b['input_ids'].to(dev), b['attention_mask'].to(dev), b['marker_pos'].to(dev),
                               b['marker_mask'].to(dev), b['qtype'].to(dev))
    mask = b['marker_mask'].to(dev)
    logp = torch.log_softmax(logits.float().masked_fill(~mask, float('-inf')), dim=-1)
    return logp, mask


def soft_ce(logp, target, mask):
    tgt = target.to(logp.device)
    return -(tgt * logp.masked_fill(~mask, 0.0)).sum(-1).mean()


@torch.no_grad()
def evaluate(agent, encoded, size):
    agent.model.eval()
    n = agree = 0
    kl = 0.0
    for group in batches(encoded, size, False):
        b = collate_items(group, agent.tok.pad_token_id)
        logp, mask = forward(agent, b)
        tgt = b['target'].to(logp.device)
        agree += (logp.argmax(-1) == tgt.argmax(-1)).sum().item()
        kl += (tgt * (torch.log(tgt.clamp_min(1e-9)) - logp.masked_fill(~mask, 0.0))).masked_fill(~mask, 0.0).sum().item()
        n += tgt.shape[0]
    return {'n': n, 'agreement': round(agree / max(1, n), 4), 'kl': round(kl / max(1, n), 4)}


def save(agent, base_dir, out):
    from safetensors.torch import save_file
    if os.path.exists(out):
        shutil.rmtree(out)
    shutil.copytree(base_dir, out, ignore=shutil.ignore_patterns('model.safetensors'))
    state = {k: v.detach().cpu().contiguous() for k, v in agent.model.state_dict().items()}
    save_file(state, os.path.join(out, 'model.safetensors'))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--train', required=True)
    ap.add_argument('--eval', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--base', default='convaiinnovations/laya-multilingual')
    ap.add_argument('--epochs', type=float, default=1.0)
    ap.add_argument('--batch', type=int, default=16)
    ap.add_argument('--lr', type=float, default=2e-5)
    ap.add_argument('--limit', type=int)
    ap.add_argument('--eval-limit', type=int, default=2000)
    ap.add_argument('--device')
    ap.add_argument('--seed', type=int, default=7)
    ap.add_argument('--dry', action='store_true', help='encode + evaluate only; no training, nothing written')
    a = ap.parse_args()
    random.seed(a.seed)
    torch.manual_seed(a.seed)

    agent = laya.load(a.base, device=a.device)
    base_dir = agent.model_dir if hasattr(agent, 'model_dir') else None
    t0 = time.time()
    train = [encode(agent, r) for r in read(a.train, a.limit)]
    held = [encode(agent, r) for r in read(a.eval, a.eval_limit)]
    print(json.dumps({'train_records': len(train), 'train_items': sum(map(len, train)), 'eval_items': sum(map(len, held)),
                      'encode_s': round(time.time() - t0, 1), 'device': str(agent.device)}), flush=True)
    before = evaluate(agent, held, a.batch)
    print(json.dumps({'eval_before': before}), flush=True)
    if a.dry:
        return

    model = agent.model
    opt = torch.optim.AdamW(model.parameters(), lr=a.lr, weight_decay=0.01)
    steps = math.ceil(len(train) / a.batch * a.epochs)
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1.0, (s + 1) / max(1, steps // 20)) * max(0.0, 1 - s / max(1, steps)))
    step = 0
    while step < steps:
        model.train()
        for group in batches(train, a.batch, True):
            b = collate_items(group, agent.tok.pad_token_id)
            logp, mask = forward(agent, b)
            loss = soft_ce(logp, b['target'], mask)
            opt.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            sched.step()
            step += 1
            if step % 50 == 0 or step == steps:
                print(json.dumps({'step': step, 'of': steps, 'loss': round(loss.item(), 4), 'elapsed_s': round(time.time() - t0)}), flush=True)
            if step >= steps:
                break
    after = evaluate(agent, held, a.batch)
    print(json.dumps({'eval_after': after}), flush=True)
    if not base_dir:
        from huggingface_hub import snapshot_download
        base_dir = snapshot_download(a.base)
    save(agent, base_dir, a.out)
    print(json.dumps({'saved': a.out, 'eval_before': before, 'eval_after': after}), flush=True)


if __name__ == '__main__':
    main()
