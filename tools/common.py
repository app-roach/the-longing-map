import UnityPy, json, math, os
import numpy as np
from ttfix import FixedGen
# Path to the game's Unity "Data" folder (read-only). Override with the LONGING_DATA environment variable.
D=os.environ.get("LONGING_DATA", os.path.expanduser("~/Library/Application Support/Steam/steamapps/common/The Longing/The Longing.app/Contents/Resources/Data")).rstrip("/")+"/"
def load_env():
    g=FixedGen('2018.4.36f1'); g.load_local_dll_folder(D+"Managed")
    env=UnityPy.load(D+"data.unity3d"); env.typetree_generator=g
    bundle=list(env.files.values())[0]
    return env,bundle
