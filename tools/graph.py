import json, glob, numpy as np
from rooms import PLAYABLE
def dj(lv):
    return json.load(open([f for f in glob.glob('dump/*.json') if f.split('/')[-1].startswith(f'{lv:02d}_')][0]))
def quat(q):
    x,y,z,w=q['x'],q['y'],q['z'],q['w']
    return np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
class Scene:
    def __init__(s,lv):
        s.lv=lv; d=dj(lv); s.o=d['objects']
        s.T={int(p):r['data'] for p,r in s.o.items() if r['type'] in('Transform','RectTransform')}
        s.go2t={t['m_GameObject']['m_PathID']:p for p,t in s.T.items()}
        s.W={}
        s.wps=[]
        for r in s.o.values():
            if r['type']=='MonoBehaviour' and r['class']=='WayPointManager': s.wps=r['data']['waypoints']
    def world(s,p):
        if p in s.W: return s.W[p]
        t=s.T[p]; M=np.eye(4)
        M[:3,:3]=quat(t['m_LocalRotation'])@np.diag([t['m_LocalScale'][k] for k in 'xyz'])
        M[:3,3]=[t['m_LocalPosition'][k] for k in 'xyz']
        par=t['m_Father']['m_PathID']
        if par in s.T: M=s.world(par)@M
        s.W[p]=M; return M
    def gopos(s,gopid):
        p=s.go2t.get(gopid); 
        if p is None: return None
        M=s.world(p); return (M[0,3],M[1,3])
    def goname(s,gopid): return s.o.get(str(gopid),{}).get('data',{}).get('m_Name')
    def active(s,gopid):
        p=s.go2t.get(gopid)
        while p in s.T:
            g=s.o.get(str(s.T[p]['m_GameObject']['m_PathID']),{}).get('data',{})
            if not g.get('m_IsActive',True): return False
            p=s.T[p]['m_Father']['m_PathID']
        return True

def links():
    S={lv:Scene(lv) for lv in PLAYABLE}
    L=[]
    for a,s in S.items():
        for p,r in s.o.items():
            if r['type']=='MonoBehaviour' and r['class']=='InteractableOutcome_GoThroughDoor':
                g=r['data']['m_GameObject']['m_PathID']
                L.append(dict(a=a,b=r['data']['BEDLLGBMAAC'],kind='door',pos=s.gopos(g),name=s.goname(g),active=s.active(g),entry=r['data']['JBOIILMMHEN']))
        for i,w in enumerate(s.wps):
            b=w['loadSceneNrOnReach']
            if b>=0: L.append(dict(a=a,b=b,kind='walk',pos=(w['pos']['x'],w['pos']['y']),name=f'wp{i}',active=True))
    for l in L:
        sb=S.get(l['b'])
        arr=[w for w in (sb.wps if sb else []) if w['introForLevel']==l['a']]
        l['arrivals']=[(w['pos']['x'],w['pos']['y']) for w in arr]
    return S,L
if __name__=="__main__":
    S,L=links()
    for l in L:
        if l['kind']=='door': print(l['a'],'->',l['b'],l['name'],[round(x,1) for x in l['pos']],l['active'],[tuple(round(v,1) for v in a) for a in l['arrivals']])
    json.dump(L,open("links.json","w"),indent=1,default=float)
