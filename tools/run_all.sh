#!/bin/sh
# Regenerate img/ and data/map.js from the game's files.  Intermediate files go to tools/work/.
set -e
cd "$(dirname "$0")"
PY="${PYTHON:-python3}"
case "$PY" in */*) PY="$(cd "$(dirname "$PY")" && pwd)/$(basename "$PY")" ;; esac   # a relative path still works inside work/
mkdir -p work && cd work
$PY ../dump.py               # scene hierarchies + script data -> dump/*.json
$PY ../graph.py > /dev/null  # doors / walkways / arrival points -> links.json
$PY ../extract_secret_map.py # the developers' world map -> secret_map.png
$PY ../render_match.py       # rooms rendered at map scale -> match/
$PY ../match.py              # template-match rooms against the map -> match/match.json
$PY ../consist.py            # keep matches confirmed by neighbouring links -> good.json
$PY ../place2.py             # place the rest by local search from neighbours -> placement.json
$PY ../export.py             # full-res tiles + thumbnails + ../../data/map.js
if [ -f ../default_layout.json ]; then $PY ../bake_layout.py; fi   # bake the default layout made in edit mode
$PY ../masks.py              # per-room brightness masks for footstep fading -> ../../img/rooms/*_mask.webp
$PY ../ui_assets.py           # game font + menu texture -> ../../fonts.css, ../../img/ui/
$PY ../room_index.py         # every room name as plain HTML in the About tab -> ../../index.html
