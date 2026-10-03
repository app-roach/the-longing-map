"""Render every room at full resolution, tile it, and write data/map.js for the web app."""
import json, os, sys, math
from rooms import *
from eternity import eternity_items
from graph import Scene, links as build_links
from PIL import Image
Image.MAX_IMAGE_PIXELS=None
OUT=os.environ.get("LONGING_OUT", os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
TILE=1024; THUMB_PPU=16

pl={int(k):tuple(v['off']) for k,v in json.load(open("placement.json")).items()}
meta={int(k):v for k,v in json.load(open("match/meta.json")).items()}
def center_off(lv,cx,cy):
    b=meta[lv]['bounds']; return (cx-(b[0]+b[1])/2, cy-(b[2]+b[3])/2)
OFF=dict(pl)
OFF.update({3:(-19.0,-85.0),4:(-43.2,-95.0),19:(25.04,-6.11),53:(-23.12,-5.86),55:(0.0,20.02),
            46:(-99.95,-18.47),49:(-142.655,-9.375),50:(-120.6,-22.0),45:(-129.5,-80.0),
            56:pl[51],68:pl[51],14:pl[38],64:pl[41],
            60:(-6.7,359.0),69:(-323.1,406.9),73:(-336.4,435.0)})
OFF[70]=center_off(70,-7.6,-11.2); OFF[71]=center_off(71,8.6,-11.2); OFF[72]=center_off(72,18.0,-52.0)

NAMES={3:"The King",4:"Home",6:"King's Stairs",7:"Entrance Hall",8:"Treasury",9:"Hall R2",10:"Hall R4",11:"Hall R3",
 12:"Moss Cliff",14:"Labyrinth 11A",15:"Hall R1",16:"Hall R5",17:"The Face",18:"Hall R6",19:"Hall R7",20:"Hall R8",
 21:"Entrance Hall II",22:"Hall L8",23:"Hall L1",24:"Gallery",25:"Hall L2",26:"Hall L3",27:"Labyrinth Entrance",
 44:"Entrance to Eternity",45:"Halls of Eternity",46:"Library",47:"Hall L4",48:"Grotto I",49:"Grotto II",
 50:"Library Entrance",51:"Hall L6",52:"Hall L7",53:"Hall L9",54:"Entrance Hall III",55:"Ascent I",56:"Hall L6 (lower path)",
 60:"Tower",61:"Ascent II",62:"The Exit",63:"Mine",64:"Labyrinth 14A",65:"Mine Shaft I",66:"Mine Shaft II",67:"Great Cave",
 68:"Behind Hall L6",69:"The Well",70:"Mystery Room I",71:"Mystery Room II",72:"Hall L5",73:"The Surface"}
for i in range(28,44): NAMES[i]=f"Labyrinth {i-27}"
REGION={}
for lv in NAMES:
    REGION[lv]=("labyrinth" if lv in range(27,45) or lv in (14,64,45) else
                "royal" if lv in (3,4,6,7,8,21,54) else
                "deep" if lv in (62,63,65,66,67,55,61) else
                "surface" if lv in (60,69,73) else
                "library" if lv in (46,48,49,50) else
                "mystery" if lv in (70,71,72) else "halls")
SHARED={56:51,68:51,14:38,64:41}   # same physical room/art as another scene
ROOMS=[lv for lv in NAMES]
SCALE={67:50, 12:64, 73:64, 60:64}

def render_full(lv,ppu):
    if lv==45:
        b=(-6,50,-4,14); im=composite(eternity_items(-10,56),b,ppu,bg=(0,0,0,0))
    else:
        r=room(lv); b=r['bounds']; im=composite(r['items'],b,ppu,bg=(0,0,0,0))
    a=np.asarray(im); lum=a[...,:3].max(axis=2); m=(a[...,3]>8)&(lum>10)
    ys,xs=np.where(m)
    x0,x1,y0,y1=xs.min(),xs.max()+1,ys.min(),ys.max()+1
    im=im.crop((x0,y0,x1,y1))
    nb=(b[0]+x0/ppu, b[0]+x1/ppu, b[3]-y1/ppu, b[3]-y0/ppu)
    # key out pure black (masks, empty tile areas) so rooms float on the page background
    a=np.asarray(im).astype(np.float32)
    mx=a[...,:3].max(axis=2)
    a[...,3]*=np.clip((mx-3)/9,0,1)
    if lv==45: a[...,:3]*=0.68   # the white halls would blow out under the viewer's brightness boost
    im=Image.fromarray(a.clip(0,255).astype(np.uint8),"RGBA")
    return im,nb

data_rooms={}
only=[int(x) for x in sys.argv[1:]]
for lv in ROOMS:
    if lv in SHARED: continue
    if only and lv not in only: continue
    ppu=SCALE.get(lv,80)
    im,b=render_full(lv,ppu)
    d=f"{OUT}/img/rooms/{lv}"; os.makedirs(d,exist_ok=True)
    for f in os.listdir(d): os.remove(os.path.join(d,f))
    W,H=im.size; tiles=[]
    for ty in range(0,H,TILE):
        for tx in range(0,W,TILE):
            t=im.crop((tx,ty,min(W,tx+TILE),min(H,ty+TILE)))
            a=np.asarray(t)
            if (a[...,3]>8).sum()==0 or a[...,:3].max()<12: continue
            t.save(f"{d}/{tx//TILE}_{ty//TILE}.webp","WEBP",lossless=True,quality=100,method=6)
            tiles.append([tx//TILE,ty//TILE])
    th=im.resize((max(1,round(W*THUMB_PPU/ppu)),max(1,round(H*THUMB_PPU/ppu))),Image.LANCZOS)
    th.save(f"{OUT}/img/rooms/{lv}_thumb.webp","WEBP",lossless=True,quality=100,method=6)
    data_rooms[lv]=dict(local=b,ppu=ppu,size=[W,H],tiles=tiles)
    print(lv,NAMES[lv],im.size,len(tiles),"tiles",flush=True)

if only:
    prev=json.load(open("export_rooms.json")); prev.update({str(k):v for k,v in data_rooms.items()}); data_rooms={int(k):v for k,v in prev.items()}
json.dump({str(k):v for k,v in data_rooms.items()},open("export_rooms.json","w"))

# ---------- assemble map data ----------
SCENE_NAMES={int(os.path.basename(f)[:2]):os.path.basename(f)[3:-5] for f in glob.glob('dump/*.json')}
def to_world(lv,p): o=OFF[lv]; return (p[0]+o[0], p[1]+o[1])
rooms_out=[]
for lv in ROOMS:
    src=SHARED.get(lv,lv); dr=data_rooms[src]; b=dr['local']; o=OFF[src]
    rooms_out.append(dict(id=lv,name=NAMES[lv],scene=SCENE_NAMES[lv],region=REGION[lv],img=src,
        rect=[round(b[0]+o[0],3), round(-(b[3]+o[1]),3), round(b[1]-b[0],3), round(b[3]-b[2],3)],
        ppu=dr['ppu'], size=dr['size'], tiles=dr['tiles'] if src==lv else None, sharedWith=SHARED.get(lv)))
S,L=build_links()
L=[l for l in L if l['a'] in NAMES and l['b'] in NAMES and l['active']]
def kind_of(a,b,k):
    pair={a,b}
    if 72 in pair: return "mystery"
    if pair=={70,71}: return "uncanny"
    if 68 in pair: return "secret"
    if pair in ({60,67},{67,69}): return "dark"
    if pair=={44,45}: return "walk"
    return k
links_out=[]; seen=set()
for l in L:
    a,b=l['a'],l['b']; key=tuple(sorted((a,b)))+(l['kind'] if 72 not in (a,b) else 'm',)
    pa=to_world(a,l['pos'])
    back=[m for m in L if m['a']==b and m['b']==a and (m['kind']==l['kind'] or 72 in (a,b))]
    if back:
        pb=to_world(b,min(back,key=lambda m:math.dist(to_world(b,m['pos']),pa))['pos'])
    elif l['arrivals']: pb=to_world(b,l['arrivals'][0])
    else: continue
    k=kind_of(a,b,l['kind'])
    if key in seen and k!="mystery": continue
    seen.add(key)
    oneway=not back and k not in ('mystery','uncanny')
    links_out.append(dict(a=a,b=b,kind=k,pa=[round(pa[0],2),round(-pa[1],2)],pb=[round(pb[0],2),round(-pb[1],2)],oneway=oneway))
# a one-way door between two rooms that already share another link (Labyrinth 14 -> 8, through the same doorway as 8 -> 14A)
img_pair=lambda l: tuple(sorted((SHARED.get(l['a'],l['a']),SHARED.get(l['b'],l['b']))))
links_out=[l for l in links_out if not (l['oneway'] and sum(img_pair(m)==img_pair(l) for m in links_out)>1)]
# extra transitions not encoded as doors/edge-walks
s4=Scene(4); s67=Scene(67)
wall=(2.0,-5.5)
arr100=[w['pos'] for w in s67.wps if w['introForLevel']==100][0]
links_out.append(dict(a=4,b=67,kind="dig",pa=list(np.round([to_world(4,wall)[0],-to_world(4,wall)[1]],2)),pb=[round(to_world(67,(arr100['x'],arr100['y']))[0],2),round(-to_world(67,(arr100['x'],arr100['y']))[1],2)],oneway=False,note="Dig through the last wall of your home"))
s69=Scene(69); s73=Scene(73)
a73=[w['pos'] for w in s73.wps if w['introForLevel']==69][0]
pa=to_world(69,(0.5,13)); pb=to_world(73,(a73['x'],a73['y']))
links_out.append(dict(a=69,b=73,kind="climb",pa=[round(pa[0],2),round(-pa[1],2)],pb=[round(pb[0],2),round(-pb[1],2)],oneway=False,note="Climb out of the well"))
# dark passages in the great cave (waypoint chains to the tower and the well)
W=s67.wps; P={}
for i,w in enumerate(W):
    for n in w['nextIDs']: P.setdefault(n,[]).append(i)
paths=[]
for t,dest in ((1272,69),(1279,60)):
    cur=t; chain=[t]
    while P.get(cur):
        cur=P[cur][0]; chain.append(cur)
        if W[cur]['pos']['y']<88: break
    pts=[to_world(67,(W[i]['pos']['x'],W[i]['pos']['y'])) for i in reversed(chain)]
    paths.append(dict(to=dest,pts=[[round(x,2),round(-y,2)] for x,y in pts]))
out=dict(rooms=rooms_out,links=links_out,paths=paths,tile=TILE,thumbPpu=THUMB_PPU)
os.makedirs(f"{OUT}/data",exist_ok=True)
with open(f"{OUT}/data/map.js","w") as f:
    f.write("// Generated by tools/export.py from the game's data files.\nwindow.LONGING_MAP = ")
    json.dump(out,f,separators=(",",":"))
    f.write(";\n")
print("rooms",len(rooms_out),"links",len(links_out))
