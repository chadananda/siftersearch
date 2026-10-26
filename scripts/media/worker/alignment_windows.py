"""Bound CTC attention memory by audio duration, preserving every input word."""
def windows(paragraph, max_seconds=25):
    group=[];start=0
    for word in paragraph.get('words',[]):
        s=float(word.get('s') if word.get('s') is not None else paragraph.get('t0',0))
        e=float(word.get('e') if word.get('e') is not None else s+.5)
        if group and e-start>max_seconds:
            yield segment(group,max_seconds);group=[]
        if not group:start=s
        group.append((word,s,e))
    if group:yield segment(group,max_seconds)

def segment(group,max_seconds):
    start=max(0,group[0][1]-1)
    return {'start':start,'end':min(max(start+.1,group[-1][2]+1),start+max_seconds+2),
            'text':' '.join(w[0].get('w','') for w in group)}
