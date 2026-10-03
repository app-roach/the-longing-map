"""Extract the developers' world map ('secret_map_4k', hidden behind Entrance Hall III) used to place the rooms."""
from composite import *
sf, items, T, G = scene_items(54)
for it in items:
    if 'secret_map' in it['path']:
        sprite_img(it['sprite'])[0].save("secret_map.png")
        print("secret_map.png written")
