from composite import *
import glob, json

PLAYABLE=[3,4,6,7,8,9,10,11,12]+list(range(14,57))+[60,61,62,63,64,65,66,67,68,69,70,71,72,73,74]
# not 13 intro, 57 extra loading, 58 HUD test, 59 ende_oberwelt (cutscene)

def dumpjson(lv):
    return json.load(open([f for f in glob.glob('dump/*.json') if f.split('/')[-1].startswith(f'{lv:02d}_')][0]))

def waypoints(lv):
    d=dumpjson(lv)
    for r in d['objects'].values():
        if r['type']=='MonoBehaviour' and r['class']=='WayPointManager':
            return r['data']['waypoints']
    return []

def is_black(it, si):
    n=(si[3] or '').lower()
    return 'black' in n or 'black' in it['path'].lower() or 'secret_map' in n

# off-camera sprites that never show in game but break the static composite
EXCLUDE={60:('mountains.png (2)',)}
MANUAL_BOUNDS={
    45:(-16,28,-9,9),   # halls of eternity: infinite corridor, show the start
    67:None,            # great cave: tiles only
}
def sprite_rect(it,si):
    A=item_corners(it,si); w,h=si[0].size
    ps=[A@[u,v,1] for u,v in ((0,0),(w,0),(0,h),(w,h))]
    return (min(p[0] for p in ps),max(p[0] for p in ps),min(p[1] for p in ps),max(p[1] for p in ps))

def room(lv, margin=9):
    sf,items,T,G=scene_items(lv)
    # 'Opacity' overlays are runtime fades (surface areas); drawing them statically leaves black boxes
    us=[it for it in items if usable(it) and 'Opacity' not in it['path'] and not any(x in it['path'] for x in EXCLUDE.get(lv,()))]
    rects=[]
    for it in us:
        si=sprite_img(it['sprite'])
        if si is None: continue
        if is_black(it,si): continue
        rects.append((sprite_rect(it,si),si[3],it))
    if not rects: return None
    union=(min(r[0][0] for r in rects),max(r[0][1] for r in rects),min(r[0][2] for r in rects),max(r[0][3] for r in rects))
    if lv in MANUAL_BOUNDS and MANUAL_BOUNDS[lv]:
        b=MANUAL_BOUNDS[lv]
    elif lv==67:
        tiles=[r[0] for r in rects if r[1].startswith('greatcave-') and 'mask' not in r[1]]
        b=(min(t[0] for t in tiles),max(t[1] for t in tiles),min(t[2] for t in tiles),max(t[3] for t in tiles))
    else:
        ws=waypoints(lv)
        if ws:
            xs=[w['pos']['x'] for w in ws if abs(w['pos']['x'])<2000]; ys=[w['pos']['y'] for w in ws]
            wb=(min(xs)-margin,max(xs)+margin,min(ys)-margin,max(ys)+margin)
            b=(max(wb[0],union[0]),min(wb[1],union[1]),max(wb[2],union[2]),min(wb[3],union[3]))
        else:
            b=union
    return dict(sf=sf, items=sorted_items(us), bounds=b)

def render_room(lv, scale, crop=True, thresh=10, pad=2):
    r=room(lv)
    if r is None: return None,None
    b=r['bounds']
    im=composite(r['items'],b,scale)
    if crop:
        a=np.asarray(im.convert('L'))
        ys,xs=np.where(a>thresh)
        if len(xs):
            x0=max(0,xs.min()-pad); x1=min(im.size[0],xs.max()+1+pad)
            y0=max(0,ys.min()-pad); y1=min(im.size[1],ys.max()+1+pad)
            im=im.crop((x0,y0,x1,y1))
            W=(b[1]-b[0]); H=(b[3]-b[2])
            nb=(b[0]+x0/scale, b[0]+x1/scale, b[3]-y1/scale, b[3]-y0/scale)
            b=nb
    return im,b
