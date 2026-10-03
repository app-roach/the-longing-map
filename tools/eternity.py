from rooms import *
from graph import Scene
def eternity_items(x0=-16,x1=60):
    lv=45
    sf,items,T,G=scene_items(lv)
    us=[it for it in items if usable(it)]
    s=Scene(lv)
    tf=bundle.files[sf.externals[3].path.split('/')[-1]]
    extra=[]; k=100000
    for p,r in s.o.items():
        if r['type']!='MonoBehaviour' or r['class'] not in ('TileManagerScript','TileManagerScriptBG'): continue
        d=r['data']; pref=d['JAHLBOJGJPO'][0]['m_PathID']; spacing=d['DDIEOFKDGGN']; y=d['PFHGPMINLKA']
        tm_pos=s.gopos(d['m_GameObject']['m_PathID'])
        go=tf.objects[pref].read_typetree()
        if go['m_Name'].startswith('eternity_glow'): continue
        tr=None; sr=None
        for c in go['m_Component']:
            o=tf.objects[c['component']['m_PathID']]
            if o.type.name=='Transform': tr=o.read_typetree()
            if o.type.name=='SpriteRenderer': sr=o.read_typetree()
        spo=resolve(tf,sr['m_Sprite']); sc=tr['m_LocalScale']
        xs=tm_pos[0]+(d.get('OHDMJBCBDGK',0) if r['class']=='TileManagerScript' else 0)
        n=0; x=xs-spacing*3
        while x<x1+spacing:
            M=np.eye(4); M[0,0]=sc['x']; M[1,1]=sc['y']; M[0,3]=x; M[1,3]=y; M[2,3]=tr['m_LocalPosition']['z']
            extra.append(dict(pid=k,path=go['m_Name'],active=True,M=M,sprite=spo,color=sr['m_Color'],flipX=sr['m_FlipX'],flipY=sr['m_FlipY'],layer=sr['m_SortingLayerID'],order=sr['m_SortingOrder'],mats=['x'],drawMode=0))
            k+=1; x+=spacing
        print(go['m_Name'], 'order',sr['m_SortingOrder'],'spacing',spacing,'y',y,'tm',tm_pos)
    return sorted_items(us+extra)
if __name__=="__main__":
    its=eternity_items()
    im=composite(its,(-16,60,-12,14),20)
    im.convert("RGB").save("renders/45_tiles.jpg")
