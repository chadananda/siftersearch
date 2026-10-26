"""Small durable coordinator queue. No audio or database access."""
import fcntl,json,os,sys,uuid
from pathlib import Path

def operation(verb,path,orders):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    with open(str(path)+'.flock','a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        try:have=json.load(open(path))
        except FileNotFoundError:have=[]
        if verb=='take':
            if have:os.replace(path,str(path)+'.taken')
            return have
        if verb=='peek':return have
        if verb=='ack':
            tickets={o.get('ticket') for o in orders}
            keep=[o for o in have if o.get('ticket') not in tickets]
            orders=keep;have=[]
            verb='add'
        if verb!='add':raise ValueError('Invalid operation')
        merged={f"{o['mode']}:{o['id']}":o for o in have}
        for o in orders:
            key=f"{o['mode']}:{o['id']}";merged[key]={**merged.get(key,{}),**o,'ticket':o.get('ticket') or uuid.uuid4().hex}
        tmp=str(path)+'.'+uuid.uuid4().hex+'.tmp'
        with open(tmp,'w') as f:
            json.dump(list(merged.values()),f);f.flush();os.fsync(f.fileno())
        os.replace(tmp,path)
        return {'queued':len(merged)}

if __name__=='__main__':print(json.dumps(operation(sys.argv[1],sys.argv[2],json.load(sys.stdin))))
