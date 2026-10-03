import UnityPy, json, sys, os
from ttfix import FixedGen
from common import D
os.makedirs("dump", exist_ok=True)
g=FixedGen('2018.4.36f1')
g.load_local_dll_folder(D+"Managed")
env = UnityPy.load(D+"data.unity3d")
env.typetree_generator = g
bundle = list(env.files.values())[0]
scenes=None
for o in env.objects:
    if o.type.name=="BuildSettings":
        scenes=o.read_typetree()["scenes"]; break

# script class names by (file, pathid)
script_names={}
def script_name(sf, ptr):
    try:
        key=(ptr['m_FileID'],ptr['m_PathID'])
        if key in script_names: return script_names[key]
        o=sf.objects[ptr['m_PathID']] if ptr['m_FileID']==0 else None
        if o is None:
            # resolve external
            ext=sf.externals[ptr['m_FileID']-1]
            name=ext.path.split('/')[-1]
            tf=bundle.files.get(name)
            o=tf.objects[ptr['m_PathID']]
        s=o.read()
        script_names[key]=s.m_ClassName
        return s.m_ClassName
    except Exception as e:
        return f"?{ptr}"

def clean(x, depth=0):
    if isinstance(x, dict): return {k: clean(v, depth+1) for k,v in x.items()}
    if isinstance(x, list):
        if len(x)>20000: return f"<list {len(x)}>"
        return [clean(v, depth+1) for v in x]
    if isinstance(x, bytes): return f"<bytes {len(x)}>"
    return x

which = sys.argv[1:] or [f"level{i}" for i in range(len(scenes))]
for lvname in which:
    i=int(lvname[5:])
    sf=bundle.files[lvname]
    out={"scene":scenes[i],"objects":{}}
    for pid,o in sf.objects.items():
        t=o.type.name
        try:
            d=o.read_typetree()
        except Exception as e:
            d={"_err":repr(e)[:200]}
        rec={"type":t}
        if t=="MonoBehaviour":
            rec["class"]=script_name(sf, d.get("m_Script",{"m_FileID":0,"m_PathID":0}))
        if t in ("Texture2D","Sprite","AudioClip","Mesh","AnimationClip","Shader","Font"):
            rec["name"]=d.get("m_Name")
            if t=="Sprite": rec["data"]={k:clean(d.get(k)) for k in ("m_Rect","m_Offset","m_PixelsToUnits","m_Pivot","m_RD") if k in d}
                
        else:
            rec["data"]=clean(d)
        out["objects"][pid]=rec
    fn=f"dump/{i:02d}_{os.path.basename(scenes[i]).replace('.unity','').replace(' ','_')}.json"
    json.dump(out, open(fn,"w"), indent=1, default=str)
    print(fn, len(out["objects"]))
