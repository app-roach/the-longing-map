import cv2, json, numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS=None
smap=cv2.cvtColor(np.array(Image.open("secret_map.png").convert("RGB")),cv2.COLOR_RGB2GRAY).astype(np.float32)
meta=json.load(open("match/meta.json"))
MW,MH=smap.shape[1],smap.shape[0]
# secret map world transform: center (7.3,34.8), 0.055 units/px
cx,cy,u=7.3,34.8,0.055
res={}
for lv,m in sorted(meta.items(),key=lambda x:int(x[0])):
    t=cv2.cvtColor(cv2.imread(f"match/{int(lv):02d}.png"),cv2.COLOR_BGR2GRAY).astype(np.float32)
    if t.shape[0]>=MH or t.shape[1]>=MW: print(lv,"too big"); continue
    r=cv2.matchTemplate(smap,t,cv2.TM_CCOEFF_NORMED)
    _,mx,_,loc=cv2.minMaxLoc(r)
    # second best away from first
    r2=r.copy(); x,y=loc; r2[max(0,y-40):y+40,max(0,x-40):x+40]=-1
    _,mx2,_,_=cv2.minMaxLoc(r2)
    # world coords of template top-left in map world
    wx0=cx+(x-MW/2)*u; wy1=cy-(y-MH/2)*u
    b=m['bounds']
    # offset = map_world - room_local
    dx=wx0-b[0]; dy=wy1-b[3]
    res[lv]=dict(score=mx, second=mx2, dx=dx, dy=dy, px=x, py=y)
    print(f"{lv:>3} score={mx:.3f} 2nd={mx2:.3f} at px=({x},{y}) offset=({dx:.1f},{dy:.1f})")
json.dump(res,open("match/match.json","w"),indent=1)
