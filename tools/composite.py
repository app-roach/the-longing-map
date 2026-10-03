from render import *
from PIL import Image
import sys, os, json

SKIP_MATS=("StencilMask","shadow")
img_cache={}
def sprite_img(spo):
    key=(id(spo.assets_file),spo.path_id)
    if key in img_cache: return img_cache[key]
    sp=spo.read()
    w,h=int(round(sp.m_Rect.width)),int(round(sp.m_Rect.height))
    try:
        im=sp.image.convert("RGBA")
    except Exception as e:
        print("img err", sp.m_Name, e); img_cache[key]=None; return None
    if im.size!=(w,h):
        full=Image.new("RGBA",(w,h),(0,0,0,0))
        off=sp.m_RD.textureRectOffset
        full.paste(im,(int(round(off.x)), int(round(h-off.y-im.size[1]))))
        im=full
    piv=sp.m_Pivot
    res=(im, sp.m_PixelsToUnits, (piv.x,piv.y), sp.m_Name)
    img_cache[key]=res
    return res

def item_corners(it, sinfo):
    im,ppu,(px,py),_=sinfo
    w,h=im.size
    fx=-1 if it['flipX'] else 1; fy=-1 if it['flipY'] else 1
    # image pixel (u,v) -> local units
    L=np.array([[fx/ppu,0,-fx*px*w/ppu],[0,-fy/ppu,fy*(h-py*h)/ppu],[0,0,1]])
    M=it['M']; Wm=np.array([[M[0,0],M[0,1],M[0,3]],[M[1,0],M[1,1],M[1,3]],[0,0,1]])
    return Wm@L

def usable(it):
    if not it['active']: return False
    if it['color']['a']<=0.001: return False
    if any(any(s in m for s in SKIP_MATS) for m in it['mats']): return False
    return True

def bounds_of(items):
    xs=[];ys=[]
    for it in items:
        si=sprite_img(it['sprite'])
        if si is None: continue
        A=item_corners(it,si); w,h=si[0].size
        for u,v in ((0,0),(w,0),(0,h),(w,h)):
            p=A@[u,v,1]; xs.append(p[0]); ys.append(p[1])
    return min(xs),max(xs),min(ys),max(ys)

def composite(items, bounds, scale, bg=(0,0,0,255)):
    xmin,xmax,ymin,ymax=bounds
    W=int(round((xmax-xmin)*scale)); H=int(round((ymax-ymin)*scale))
    canvas=Image.new("RGBA",(W,H),bg)
    C=np.array([[scale,0,-xmin*scale],[0,-scale,ymax*scale],[0,0,1]])
    for it in items:
        si=sprite_img(it['sprite'])
        if si is None: continue
        im=si[0]
        A=C@item_corners(it,si)
        w,h=im.size
        pts=[A@[u,v,1] for u,v in ((0,0),(w,0),(0,h),(w,h))]
        bx0=max(0,int(np.floor(min(p[0] for p in pts)))); by0=max(0,int(np.floor(min(p[1] for p in pts))))
        bx1=min(W,int(np.ceil(max(p[0] for p in pts)))); by1=min(H,int(np.ceil(max(p[1] for p in pts))))
        if bx1<=bx0 or by1<=by0: continue
        T=np.array([[1,0,bx0],[0,1,by0],[0,0,1]])
        inv=np.linalg.inv(A)@T
        c=it['color']
        src=im
        if (c['r'],c['g'],c['b'],c['a'])!=(1,1,1,1):
            arr=np.asarray(im).astype(np.float32)
            arr*=np.array([c['r'],c['g'],c['b'],c['a']],dtype=np.float32)
            src=Image.fromarray(np.clip(arr,0,255).astype(np.uint8),"RGBA")
        piece=src.transform((bx1-bx0,by1-by0),Image.AFFINE,data=tuple(inv[:2].flatten()),resample=Image.BICUBIC)
        canvas.alpha_composite(piece,(bx0,by0))
    return canvas

def sorted_items(items):
    return sorted(items,key=lambda i:(i['layer'],i['order'],-i['M'][2,3],i['pid']))

if __name__=="__main__":
    lv=int(sys.argv[1]); scale=float(sys.argv[2]) if len(sys.argv)>2 else 40
    sf,items,T,G=scene_items(lv)
    us=[it for it in items if usable(it)]
    core=[it for it in us if 'black' not in it['path'].lower()]
    b=bounds_of(core)
    print("bounds",b)
    im=composite(sorted_items(us),b,scale)
    os.makedirs("renders",exist_ok=True)
    im.convert("RGB").save(f"renders/{lv:02d}.jpg",quality=88)
    print(im.size)
