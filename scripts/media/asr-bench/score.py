# WER + timing vs corrected reference. python score.py out/*.json   (ref = <clip>.ref.json, words with s/e)
import sys, json, re, unicodedata, statistics, os
D = os.environ.get("D", "tmp/asrb")
def norm(w):
    w = unicodedata.normalize("NFKD", w.lower())
    w = "".join(c for c in w if not unicodedata.category(c).startswith(("P", "M", "S", "C")))
    return w.replace("ي", "ی").replace("ك", "ک").replace("ۀ", "ه")
def toks(ws):
    out = []
    for x in ws:
        for p in re.split(r"[\s\-—–/]+", x["w"]):
            n = norm(p)
            if n: out.append((n, x["s"]))
    return out
def align(r, h):
    n, m = len(r), len(h)
    d = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n + 1): d[i][0] = i
    for j in range(m + 1): d[0][j] = j
    for i in range(1, n + 1):
        ri = r[i - 1][0]; di = d[i]; dp = d[i - 1]
        for j in range(1, m + 1):
            di[j] = min(dp[j - 1] + (ri != h[j - 1][0]), dp[j] + 1, di[j - 1] + 1)
    i, j, pairs, S, De, I = n, m, [], 0, 0, 0
    while i or j:
        if i and j and d[i][j] == d[i - 1][j - 1] + (r[i - 1][0] != h[j - 1][0]):
            if r[i - 1][0] == h[j - 1][0]: pairs.append((r[i - 1][1], h[j - 1][1]))
            else: S += 1
            i -= 1; j -= 1
        elif i and d[i][j] == d[i - 1][j] + 1: De += 1; i -= 1
        else: I += 1; j -= 1
    return S, De, I, pairs
for f in sys.argv[1:]:
    o = json.load(open(f)); c = o["clip"]
    ref = toks(json.load(open(f"{D}/{c}.ref.json"))); hyp = toks([w for w in o["words"] if 120 <= w["s"] + 120 < 720 or True])
    # hyp times are clip-relative (0..600); reference times are absolute (clip started at 120 s)
    hyp = [(n, s + 120) for n, s in hyp]
    S, De, I, pairs = align(ref, hyp)
    er = [abs(a - b) for a, b in pairs]
    print(f"{o['engine']:24s} {c:8s} WER {100*(S+De+I)/len(ref):5.1f}%  (S{S} D{De} I{I} of {len(ref)})  RTF {o['rtf']:.4f}  wall {o['wall_s']:.0f}s  "
          f"t_med {'n/a' if o['engine'].startswith('tw') else str(round(1000*statistics.median(er)))+'ms'}  <=250ms {'n/a' if o['engine'].startswith('tw') else str(round(100*sum(e<=.25 for e in er)/max(1,len(er))))+'%'}  rss {o.get('maxrss_mb',0):.0f}MB vram {o.get('vram_peak_gb',0):.1f}GB")
