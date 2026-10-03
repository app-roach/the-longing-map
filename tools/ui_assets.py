"""Extract the game's UI look for the map: its QUINTESSENCE font (embedded as a data URI in fonts.css, since
browsers refuse web fonts loaded from file:// pages) and the menu background texture (img/ui/wood.webp)."""
import base64
import io
import os

from fontTools.ttLib import TTFont
from PIL import Image

from common import load_env
from composite import sprite_img

OUT = os.environ.get("LONGING_OUT", os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


def unicode_range(font_bytes):
    """CSS unicode-range of the codepoints that have visible glyphs. The font maps some characters (% · [ ] …)
    to empty glyphs; leaving them out of the range lets the browser draw them with the fallback font."""
    f = TTFont(io.BytesIO(font_bytes))
    glyf = f["glyf"]
    cps = sorted(cp for cp, g in f.getBestCmap().items() if cp == 0x20 or glyf[g].numberOfContours != 0)
    ranges, start = [], cps[0]
    for prev, cp in zip(cps, cps[1:] + [None]):
        if cp != prev + 1:
            ranges.append(f"U+{start:04X}" if start == prev else f"U+{start:04X}-{prev:04X}")
            start = cp
    return ", ".join(ranges)


def main():
    env, bundle = load_env()
    font = None
    for o in env.objects:
        if o.type.name == "Font":
            d = o.read_typetree()
            if d["m_Name"] == "QUINTESSENCE" and d.get("m_FontData"):
                font = bytes(d["m_FontData"])
                break
    b64 = base64.b64encode(font).decode()
    with open(os.path.join(OUT, "fonts.css"), "w", encoding="utf-8") as f:
        f.write("/* QUINTESSENCE, the font used throughout The Longing. Extracted from the game by tools/ui_assets.py. */\n")
        f.write("@font-face { font-family: 'Quintessence'; font-display: block;\n"
                f"  unicode-range: {unicode_range(font)};\n"
                f"  src: url(data:font/ttf;base64,{b64}) format('truetype'); }}\n")
    want = {"menue_bg_2k_plain", "HUD", "auswahlbild", "menue_selection_0001", "exitbutton_0001", "chooseabook_empty"}
    sp = {}
    for o in env.objects:
        if o.type.name == "Sprite":
            name = o.read().m_Name
            if name in want and name not in sp:
                sp[name] = sprite_img(o)[0].convert("RGBA")
    ui = os.path.join(OUT, "img", "ui")
    os.makedirs(ui, exist_ok=True)
    save = lambda im, name, **kw: im.save(os.path.join(ui, name), "WEBP", quality=88, method=5, **kw)
    save(sp["menue_bg_2k_plain"].convert("RGB").resize((1024, 1024), Image.LANCZOS), "wood.webp")
    # one period of the HUD's border of squares (left column): half a rune band, a square, half a band
    save(sp["HUD"].crop((0, 126, 88, 188)), "slot.webp")
    save(sp["auswahlbild"], "select.webp")                      # white frame the game puts around a chosen book
    save(sp["menue_selection_0001"], "button.webp")             # carved menu button, used as a 9-slice
    # the square rune button with its symbol painted over by plain button wood
    sq = sp["exitbutton_0001"].copy()
    field = sp["menue_selection_0001"].crop((120, 30, 300, 92)).resize((46, 47), Image.LANCZOS)
    sq.paste(field, (16, 12))
    save(sq, "sqbutton.webp")
    save(sp["chooseabook_empty"].crop((150, 120, 500, 800)).convert("RGB"), "parchment.webp")   # book list paper
    print("fonts.css and img/ui/*.webp written")


if __name__ == "__main__":
    main()
