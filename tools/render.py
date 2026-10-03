from common import *
from PIL import Image, ImageChops
import sys, re

env,bundle=load_env()

def resolve(sf, ptr):
    fid,pid=ptr['m_FileID'],ptr['m_PathID']
    if pid==0: return None
    if fid==0: tf=sf
    else:
        name=sf.externals[fid-1].path.split('/')[-1]
        tf=bundle.files.get(name)
        if tf is None: return None
    return tf.objects.get(pid)

def quat_mat(q):
    x,y,z,w=q['x'],q['y'],q['z'],q['w']
    return np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
                     [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
                     [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])

shader_cache={}
def shader_name(sf, mptr):
    key=(id(sf),mptr['m_FileID'],mptr['m_PathID'])
    if key in shader_cache: return shader_cache[key]
    name="?"
    try:
        mo=resolve(sf,mptr)
        if mo:
            m=mo.read_typetree()
            so=resolve(mo.assets_file, m['m_Shader'])
            if so:
                s=so.read()
                name=getattr(s,'m_ParsedForm',None) and s.m_ParsedForm.m_Name or s.m_Name
            name=m.get('m_Name','')+"|"+str(name)
    except Exception as e:
        name="err:"+str(e)[:40]
    shader_cache[key]=name
    return name

def scene_items(level):
    sf=bundle.files[f'level{level}']
    T={}; G={}
    for pid,o in sf.objects.items():
        if o.type.name in ("Transform","RectTransform"):
            t=o.read_typetree()
            T[pid]=t
        elif o.type.name=="GameObject":
            G[pid]=o.read_typetree()
    go2t={t['m_GameObject']['m_PathID']:pid for pid,t in T.items()}
    W={}
    def world(pid):
        if pid in W: return W[pid]
        t=T[pid]
        M=np.eye(4)
        R=quat_mat(t['m_LocalRotation']); S=np.diag([t['m_LocalScale']['x'],t['m_LocalScale']['y'],t['m_LocalScale']['z']])
        M[:3,:3]=R@S; M[:3,3]=[t['m_LocalPosition']['x'],t['m_LocalPosition']['y'],t['m_LocalPosition']['z']]
        par=t['m_Father']['m_PathID']
        if par and par in T: M=world(par)@M
        W[pid]=M; return M
    def active(pid):
        t=T[pid]; g=G.get(t['m_GameObject']['m_PathID'])
        if g is None or not g['m_IsActive']: return False
        par=t['m_Father']['m_PathID']
        return active(par) if par and par in T else True
    def path(pid):
        t=T[pid]; g=G.get(t['m_GameObject']['m_PathID'],{})
        par=t['m_Father']['m_PathID']
        n=g.get('m_Name','?')
        return (path(par)+"/"+n) if par and par in T else n
    items=[]
    for pid,o in sf.objects.items():
        if o.type.name!="SpriteRenderer": continue
        r=o.read_typetree()
        tp=go2t.get(r['m_GameObject']['m_PathID'])
        if tp is None: continue
        spo=resolve(sf,r['m_Sprite'])
        if spo is None: continue
        mats=[shader_name(sf,m) for m in r['m_Materials']]
        items.append(dict(pid=pid, path=path(tp), active=active(tp) and bool(r['m_Enabled']), M=world(tp),
            sprite=spo, color=r['m_Color'], flipX=r['m_FlipX'], flipY=r['m_FlipY'],
            layer=r['m_SortingLayerID'], order=r['m_SortingOrder'], mats=mats, drawMode=r.get('m_DrawMode',0)))
    return sf, items, T, G

if __name__=="__main__":
    lv=int(sys.argv[1])
    sf,items,T,G=scene_items(lv)
    for it in sorted(items,key=lambda i:(i['order'],-i['M'][2,3])):
        sp=it['sprite'].read()
        print(f"{'A' if it['active'] else '-'} o={it['order']:4d} z={it['M'][2,3]:6.1f} pos=({it['M'][0,3]:6.1f},{it['M'][1,3]:6.1f}) sc={np.linalg.norm(it['M'][:3,0]):.2f} rect={sp.m_Rect.width:.0f}x{sp.m_Rect.height:.0f} ppu={sp.m_PixelsToUnits:.0f} a={it['color']['a']:.2f} {it['mats'][0][:40]:40s} {it['path'][:70]}")
