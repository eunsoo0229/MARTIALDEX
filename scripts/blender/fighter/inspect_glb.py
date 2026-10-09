"""Print per-primitive summary of a .glb (materials, COLOR_0 mean, animations).
python3 scripts/blender/fighter/inspect_glb.py assets/3d/fighter/export/martialdex_fighter.glb"""
import json, struct, sys
import numpy as np

b = open(sys.argv[1], "rb").read()
L = struct.unpack("<I", b[12:16])[0]
js = json.loads(b[20:20 + L])
bin_ = b[20 + L + 8:]
CT = {5126: ("f4", 4), 5123: ("u2", 2), 5121: ("u1", 1)}
NORM = {5123: 65535.0, 5121: 255.0}


def acc(i):
    a = js["accessors"][i]
    bv = js["bufferViews"][a["bufferView"]]
    n = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[a["type"]]
    dt, sz = CT[a["componentType"]]
    off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    stride = bv.get("byteStride", sz * n)
    raw = np.frombuffer(bin_[off:off + stride * a["count"]], dtype=np.uint8).reshape(a["count"], stride)[:, :sz * n]
    v = np.frombuffer(raw.tobytes(), dtype=dt).reshape(-1, n).astype(np.float64)
    return v / NORM.get(a["componentType"], 1.0) if a.get("normalized") else v


for m in js["meshes"]:
    for p in m["primitives"]:
        mat = js["materials"][p["material"]]
        bc = mat.get("pbrMetallicRoughness", {}).get("baseColorFactor", [1, 1, 1, 1])
        line = f"{mat['name']:20s} verts={js['accessors'][p['attributes']['POSITION']]['count']:6d} baseColor={[round(x, 3) for x in bc[:3]]}"
        if "COLOR_0" in p["attributes"]:
            c = acc(p["attributes"]["COLOR_0"])
            line += f" COLOR_0 mean={c[:, :3].mean(0).round(3).tolist()} min={c[:, :3].min(0).round(3).tolist()}"
        print(line)
print("skins", [(s.get("name"), len(s["joints"])) for s in js.get("skins", [])])
print("animations", [a["name"] for a in js.get("animations", [])])
