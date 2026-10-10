import collections,re,sys
rows=[l.rstrip('\n').split('\t') for l in open('docs.tsv')]
rows={r[0]:r for r in rows if len(r)==11 and r[7]==''}
st={}
for l in open('bl_out.txt'):
    x=l.strip().split('|')
    if len(x)==6: st[x[0]]=list(map(int,x[1:]))
canon_titles=collections.defaultdict(list)
for l in open('all_live.tsv'):
    x=l.rstrip('\n').split('\t')
    if len(x)>=3 and x[2] in('','oceanlibrary.com'): canon_titles[x[1].strip().lower()].append(x[0])
bl_named=collections.defaultdict(list)
for i,r in rows.items():
    if not re.fullmatch(r'\d+\.md',r[1]): bl_named[r[2].strip().lower()].append(i)
LIST_FAM=('tags-','chronology-','chronologycanada-','bibliography-','ris-','author-','advancedsearch-','series-','date-')
def cls(i,r):
    fp=r[1]; t=r[2]; s=st.get(i,[0,0,0,0,0])
    n,chars,nl,nc,nb=s
    tags=[]
    if re.fullmatch(r'\d+\.md',fp): tags.append('4_numeric_alias' if bl_named.get(t.strip().lower()) else '4_numeric_noalias')
    if fp.startswith('inventory-'): tags.append('1b_inventory')
    elif fp.startswith(LIST_FAM) or re.match(r'(Tag:|Browse |Index of /|Advanced Search|List all documents|Chronology:)',t) or t=="Bahá'í Library Online": tags.append('1_listing')
    if n==0: tags.append('0_hollow')
    elif n<=2 or chars<400: tags.append('2_near_empty')
    if nl>0 and nc/nl>=0.5: tags.append('3_dup_canon_para')
    elif canon_titles.get(t.strip().lower()) and len(t)>12: tags.append('3_dup_canon_title')
    if nl>0 and nb/nl>=0.8 and '3_dup_canon_para' not in tags: tags.append('3b_dup_other_bl')
    return tags,s
out={}
for i,r in rows.items(): out[i]=cls(i,r)
import pickle; pickle.dump((rows,out),open('cls.pkl','wb'))
# primary class precedence
prec=['1_listing','1b_inventory','0_hollow','4_numeric_alias','4_numeric_noalias','3_dup_canon_para','2_near_empty','3_dup_canon_title','3b_dup_other_bl']
P=collections.Counter(); PP=collections.Counter(); ANY=collections.Counter(); ANYP=collections.Counter(); ex=collections.defaultdict(list)
for i,(tags,s) in out.items():
    p=next((c for c in prec if c in tags),'5_keep')
    P[p]+=1; PP[p]+=s[0]; ex[p].append(i)
    for t in tags: ANY[t]+=1; ANYP[t]+=s[0]
print('PRIMARY'); [print(f'{c}\t{P[c]}\t{PP[c]}') for c in prec+['5_keep']]
print('ANY'); [print(f'{c}\t{ANY[c]}\t{ANYP[c]}') for c in prec]
print('total docs',len(out),'paras',sum(s[0] for _,s in out.values()))
import random; random.seed(1)
for c in prec+['5_keep']:
    print('--',c)
    for i in random.sample(ex[c],min(6,len(ex[c]))): print('  ',i,rows[i][2][:80],'|',rows[i][1][:50],out[i][1][:5])
