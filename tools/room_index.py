"""Write the list of every room into the About tab of index.html, as plain HTML that search engines can read.

    python3 tools/room_index.py              # run_all.sh does this after data/map.js is rebuilt

Rewrites everything between <!-- room-index:begin --> and <!-- room-index:end --> in index.html.
"""
import html
import json
import os
import re
import sys

TOOLS = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get("LONGING_OUT", os.path.abspath(os.path.join(TOOLS, "..")))
MAP_JS = os.path.join(ROOT, "data", "map.js")
INDEX = os.path.join(ROOT, "index.html")
BEGIN, END = "<!-- room-index:begin -->", "<!-- room-index:end -->"
# map.js region -> heading, in the order a player tends to meet them
REGIONS = {
    "royal": "Royal halls",
    "halls": "The halls",
    "library": "Library & grottos",
    "labyrinth": "Labyrinth & Eternity",
    "deep": "Mines & the Exit",
    "surface": "The surface",
    "mystery": "Mystery rooms",
}
INDENT = "    "


def natural(name):
    """Hall R2 before Hall R10; numbered rooms before named ones ("Labyrinth 1" before "Labyrinth Entrance")."""
    return [(0, int(p)) if p.isdigit() else (1, p) for p in re.split(r"(\d+)", name.lower()) if p]


def main():
    s = open(MAP_JS, encoding="utf-8").read()
    rooms = json.loads(s[s.index("{"):s.rindex("}") + 1])["rooms"]
    by_region = {}
    for r in rooms:
        by_region.setdefault(r["region"], []).append(r)
    order = list(REGIONS) + sorted(set(by_region) - set(REGIONS))

    lines = [BEGIN]
    for region in order:
        if region not in by_region:
            continue
        lines.append('<div class="region">')
        lines.append(f'  <h3>{html.escape(REGIONS.get(region, region.title()), quote=False)}</h3>')
        lines.append('  <ul class="roomindex">')
        for r in sorted(by_region[region], key=lambda r: natural(r["name"])):
            lines.append(f'    <li data-room="{r["id"]}">{html.escape(r["name"], quote=False)}</li>')
        lines.append('  </ul>')
        lines.append('</div>')
    lines.append(END)

    page = open(INDEX, encoding="utf-8").read()
    if BEGIN not in page or END not in page:
        sys.exit(f"{INDEX} has no {BEGIN} … {END} block")
    head, rest = page.split(BEGIN, 1)
    tail = rest.split(END, 1)[1]
    block = ("\n" + INDENT).join(lines)
    with open(INDEX, "w", encoding="utf-8") as f:
        f.write(head + block + tail)
    print(f"index.html: {len(rooms)} rooms in {len(by_region)} regions")


if __name__ == "__main__":
    main()
