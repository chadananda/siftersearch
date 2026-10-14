#!/usr/bin/env python3
# Seeker-battery scorer (HyPE prompt A/B). Runs ON tower (Gemini key + local Qdrant, no SQLite). Input = POST /api/admin/concepts/hype-sample outputs keyed by docId.
# Seeker-battery scorer: popular questions → which sample paragraph's HyPE set matches best (Gemini embedding-2, the
# prefixes live search and the hype indexer use). Usage: python3 score-seeker.py hs-a.json [hs-b.json ...]  (run on tower)
import json,sys,os,urllib.request,math
KEY=[l.split('=',1)[1].strip().strip('"') for f in ('.env-secrets','.env-public') if os.path.exists(f) for l in open(f) if l.startswith('GEMINI_API_KEY=')][0]
URL=f'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:batchEmbedContents?key={KEY}'
cache={}
def emb(texts):
    need=[t for t in texts if t not in cache]
    for i in range(0,len(need),96):
        ch=need[i:i+96]
        body={'requests':[{'model':'models/gemini-embedding-2','content':{'parts':[{'text':t}]},'outputDimensionality':3072} for t in ch]}
        r=json.load(urllib.request.urlopen(urllib.request.Request(URL,data=json.dumps(body).encode(),headers={'content-type':'application/json'}),timeout=120))
        for t,e in zip(ch,r['embeddings']): v=e['values']; n=math.sqrt(sum(x*x for x in v)); cache[t]=[x/n for x in v]
    return [cache[t] for t in texts]
cos=lambda a,b: sum(x*y for x,y in zip(a,b))
BATTERY={('20911',623):['what happens after we die','is there life after death','what is the soul'],
 ('20911',686):['what is evil','why is there evil in the world'],
 ('20809',12):['what is love','how can I feel God\'s love'],
 ('20809',74):['what is happiness','how can I be joyful'],
 ('20810',104):['who is God','can I know God personally'],
 ('20810',20):['do all religions worship the same God','why are there so many religions','are Jesus and Muhammad the same'],
 ('20893',291):['why do religions change over time','is humanity growing up'],
 ('20890',101):['are men and women equal']}
qs=[q for v in BATTERY.values() for q in v]
qv=dict(zip(qs,emb([f'task: search result | query: {q}' for q in qs])))
QK=[l.split('=',1)[1].strip().strip('"') for f in ('.env-secrets','.env-public') if os.path.exists(f) for l in open(f) if l.startswith('QDRANT_KEY=')][0]
def rival(q,doc):
    # best HyPE question from ANY OTHER book in the live collection (exact cosine via rescore)
    body={'query':qv[q],'using':'literal','limit':1,'with_payload':['doc_id'],'params':{'quantization':{'rescore':True,'oversampling':4}},
          'filter':{'must_not':[{'key':'doc_id','match':{'value':int(doc)}}]}}
    r=json.load(urllib.request.urlopen(urllib.request.Request('http://localhost:6333/collections/hype/points/query',data=json.dumps(body).encode(),headers={'content-type':'application/json','api-key':QK}),timeout=60))
    p=r['result']['points']; return (p[0]['score'],p[0]['payload']['doc_id']) if p else (0,None)
RIV={(k,q):rival(q,k[0]) for k,v in BATTERY.items() for q in v}
for path in sys.argv[1:]:
    d=json.load(open(path)); sets={}; texts={}
    for doc,r in d.items():
        for s in r['samples']:
            k=(doc,s['pidx']); sets[k]=[it['q'] for it in s['items']]+([s['thesis']] if s.get('thesis') else []); texts[k]=s['text']
    allq=[q for v in sets.values() for q in v]
    ev=dict(zip(allq,emb([f'title: none | text: {q}' for q in allq])))
    tv=dict(zip(texts.keys(),emb([f'title: none | text: {t}' for t in texts.values()])))
    hits=0; tot=0; simsum=0; thit=0; wins=0; rows=[]
    for k,queries in BATTERY.items():
        if k not in sets: continue
        for q in queries:
            score={kk:max(cos(qv[q],ev[x]) for x in v) for kk,v in sets.items()}
            best=max(score,key=score.get); r=sorted(score,key=score.get,reverse=True).index(k)+1
            tscore={kk:cos(qv[q],tv[kk]) for kk in texts}; tr=sorted(tscore,key=tscore.get,reverse=True).index(k)+1
            bq=max(sets[k],key=lambda x:cos(qv[q],ev[x]))
            rv,rdoc=RIV[(k,q)]; win=score[k]>rv
            tot+=1; hits+=(r==1); thit+=(tr==1); simsum+=score[k]; wins+=win
            rows.append(f'  {"WIN " if win else "lose"} sim {score[k]:.3f} vs rival {rv:.3f} (doc {rdoc})  {q!r:40} ← {bq[:72]!r}')
    print(f'\n== {path}: HyPE top-1 {hits}/{tot} · text-only top-1 {thit}/{tot} · mean best-sim {simsum/tot:.3f} · questions {len(allq)}')
    print('\n'.join(rows))
