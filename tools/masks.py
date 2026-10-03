"""Write img/rooms/<id>_mask.webp: one mask per room whose alpha marks where there is any art at all
(same size and placement as the thumbnail). The map draws these over the footsteps with
'destination-out', so footsteps stay solid over the black background and nearly vanish over art."""
import json
import os

import numpy as np
from PIL import Image

ROOT = os.environ.get("LONGING_OUT", os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
BLACK, ART = 0.012, 0.06   # luminance: below BLACK counts as empty background, above ART as art (soft ramp between)


def main():
    src = open(os.path.join(ROOT, "data", "map.js"), encoding="utf-8").read()
    data = json.loads(src[src.index("{"):src.rindex("}") + 1])
    total = 0
    for r in data["rooms"]:
        if r["img"] != r["id"]:
            continue                      # shared art: the primary room carries the mask
        thumb = Image.open(os.path.join(ROOT, "img", "rooms", f"{r['id']}_thumb.webp")).convert("RGBA")
        a = np.asarray(thumb).astype(np.float32) / 255.0
        lum = (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]) * a[..., 3]
        mask = np.zeros(a.shape, np.uint8)
        t = np.clip((lum - BLACK) / (ART - BLACK), 0, 1)
        mask[..., 3] = (t * t * (3 - 2 * t) * 255).astype(np.uint8)   # smoothstep
        path = os.path.join(ROOT, "img", "rooms", f"{r['id']}_mask.webp")
        Image.fromarray(mask, "RGBA").save(path, "WEBP", lossless=True, quality=100, method=6)
        total += os.path.getsize(path)
    print(f"masks written: {total // 1024} KB")


if __name__ == "__main__":
    main()
