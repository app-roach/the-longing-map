import json, numpy as np
from PIL import Image, ImageDraw, ImageFont
Image.MAX_IMAGE_PIXELS=None
meta={int(k):v for k,v in json.load(open("match/meta.json")).items()}
gm={int(k):v for k,v in json.load(open("match/match.json")).items()}
L=json.load(open("links.json"))
TELEPORT={(68,11),(11,68),(68,47),(47,68),(60,67),(67,60),(67,69),(69,67),(44,45),(45,44),(70,71),(71,70)}
OFFMAP={4,45,60,69,70,71,72,73,74}
cons={}
for l in L:
    a,b=l['a'],l['b']
    if (a,b) in TELEPORT or a in OFFMAP or b in OFFMAP or not l['active'] or not l['arrivals']: continue
    if a not in gm or b not in gm: continue
    arr=l['arrivals'][0]
    rel=(l['pos'][0]-arr[0], l['pos'][1]-arr[1])
    md=(gm[b]['dx']-gm[a]['dx'], gm[b]['dy']-gm[a]['dy'])
    err=np.hypot(md[0]-rel[0], md[1]-rel[1])
    tol=14 if l['kind']=='walk' else 22
    cons.setdefault(a,[]).append((b,l['kind'],round(err,1),err<tol))
    cons.setdefault(b,[]).append((a,l['kind'],round(err,1),err<tol))
good=set()
for lv in sorted(gm):
    c=cons.get(lv,[])
    ok=[x for x in c if x[3]]
    if ok: good.add(lv)
    print(lv, "OK" if ok else "--", f"score={gm[lv]['score']:.2f}", c)
json.dump(sorted(good),open("good.json","w"))
smap=Image.open("secret_map.png").convert("RGB"); d=ImageDraw.Draw(smap)
cx,cy,u=7.3,34.8,0.055; MW,MH=smap.size
for lv,m in gm.items():
    b=meta[lv]['bounds']; x0=(b[0]+m['dx']-cx)/u+MW/2; y0=(cy-(b[3]+m['dy']))/u+MH/2
    w=(b[1]-b[0])/u; h=(b[3]-b[2])/u
    col=(0,255,0) if lv in good else (255,60,60)
    d.rectangle([x0,y0,x0+w,y0+h],outline=col,width=5)
    d.text((x0+6,y0+4),str(lv),fill=col,font=ImageFont.load_default(size=56))
smap.crop((0,2400,8192,5560)).resize((2700,1041)).save("gm_overlay_bottom.jpg",quality=85)
smap.crop((1500,0,7500,3000)).resize((2400,1200)).save("gm_overlay_top.jpg",quality=85)
