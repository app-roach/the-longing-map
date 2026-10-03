from rooms import *
import sys
S=100/5.5
os.makedirs("match",exist_ok=True)
os.makedirs("renders",exist_ok=True)
meta={}
for lv in (PLAYABLE if len(sys.argv)<2 else [int(x) for x in sys.argv[1:]]):
    im,b=render_room(lv,S)
    if im is None: print(lv,"none"); continue
    im.convert("RGB").save(f"match/{lv:02d}.png")
    meta[lv]=dict(bounds=[float(x) for x in b], size=im.size)
    print(lv, [round(x,1) for x in b], im.size, flush=True)
json.dump(meta,open("match/meta.json","w"),indent=1)
