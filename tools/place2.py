import cv2, json, numpy as np
from PIL import Image, ImageDraw, ImageFont
Image.MAX_IMAGE_PIXELS=None
smap_rgb=Image.open("secret_map.png").convert("RGB")
smap=cv2.cvtColor(np.array(smap_rgb),cv2.COLOR_RGB2GRAY).astype(np.float32)
MH,MW=smap.shape; cx,cy,u=7.3,34.8,0.055
meta={int(k):v for k,v in json.load(open("match/meta.json")).items()}
gm={int(k):v for k,v in json.load(open("match/match.json")).items()}
L=json.load(open("links.json"))
good=set(json.load(open("good.json")))
TELEPORT={(68,11),(11,68),(68,47),(47,68),(60,67),(67,60),(67,69),(69,67),(44,45),(45,44),(70,71),(71,70)}
OFFMAP={4,45,60,69,70,71,72,73,74,68}
def tmpl(lv): return cv2.cvtColor(cv2.imread(f"match/{lv:02d}.png"),cv2.COLOR_BGR2GRAY).astype(np.float32)
def off2px(lv,o): b=meta[lv]['bounds']; return ((b[0]+o[0]-cx)/u+MW/2,(cy-(b[3]+o[1]))/u+MH/2)
def px2off(lv,x,y): b=meta[lv]['bounds']; return (cx+(x-MW/2)*u-b[0], cy-(y-MH/2)*u-b[3])
def local_match(lv,pred,R):
    t=tmpl(lv); th,tw=t.shape; px,py=off2px(lv,pred); R/=u
    x0=int(max(0,px-R)); y0=int(max(0,py-R)); x1=int(min(MW,px+R+tw)); y1=int(min(MH,py+R+th))
    if x1-x0<=tw or y1-y0<=th: return None
    r=cv2.matchTemplate(smap[y0:y1,x0:x1],t,cv2.TM_CCOEFF_NORMED)
    _,mx,_,loc=cv2.minMaxLoc(r); return mx, px2off(lv,x0+loc[0],y0+loc[1])
off={lv:(gm[lv]['dx'],gm[lv]['dy']) for lv in good}; how={lv:f"global {gm[lv]['score']:.2f}" for lv in good}
off[54]=(0.0,0.0); how[54]="anchor (map frame)"
def preds(b):
    P=[]
    for l in L:
        if l['b']==b and l['a'] in off and (l['a'],b) not in TELEPORT and l['active'] and l['arrivals']:
            arr=l['arrivals'][0]; P.append((0 if l['kind']=='walk' else 1, l['a'], (off[l['a']][0]+l['pos'][0]-arr[0], off[l['a']][1]+l['pos'][1]-arr[1])))
        if l['a']==b and l['b'] in off and (b,l['b']) not in TELEPORT and l['active'] and l['arrivals']:
            arr=l['arrivals'][0]; P.append((0 if l['kind']=='walk' else 1, l['b'], (off[l['b']][0]-l['pos'][0]+arr[0], off[l['b']][1]-l['pos'][1]+arr[1])))
    return sorted(P)
changed=True
while changed:
    changed=False
    cands=[(preds(b)[0],b) for b in meta if b not in off and b not in OFFMAP and preds(b)]
    if not cands: break
    cands.sort()
    (kind,a,pred),b=cands[0]
    lm=local_match(b,pred,22 if kind==0 else 35)
    if lm and lm[0]>0.35: off[b]=lm[1]; how[b]=f"local {lm[0]:.2f} from {a}"
    else: off[b]=pred; how[b]=f"pred from {a} ({lm[0] if lm else 0:.2f})"
    changed=True
for lv in sorted(off): print(lv, [round(x,1) for x in off[lv]], how[lv])
print("unplaced", [lv for lv in meta if lv not in off])
json.dump({lv:dict(off=off[lv],how=how[lv]) for lv in off},open("placement.json","w"),indent=1)
sm=smap_rgb.copy(); d=ImageDraw.Draw(sm)
for lv,o in off.items():
    b=meta[lv]['bounds']; x0,y0=off2px(lv,o); w=(b[1]-b[0])/u; h=(b[3]-b[2])/u
    col=(0,255,0) if how[lv].startswith('global') else (0,200,255) if how[lv].startswith('local') else (255,60,60)
    d.rectangle([x0,y0,x0+w,y0+h],outline=col,width=5); d.text((x0+6,y0+4),str(lv),fill=col,font=ImageFont.load_default(size=56))
sm.crop((0,2400,8192,5560)).resize((2700,1041)).save("pl_bottom.jpg",quality=85)
sm.crop((1500,0,7500,3000)).resize((2400,1200)).save("pl_top.jpg",quality=85)
