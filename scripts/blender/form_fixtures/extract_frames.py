"""Decode rendered fixture WebMs (through Blender's VSE / ffmpeg) into PNG frames
for contact sheets, and report the decoded frame count / fps / resolution.

  Blender -b --factory-startup --python scripts/blender/form_fixtures/extract_frames.py
  python3 scripts/blender/form_fixtures/contact_sheets.py
"""
import json
import os

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT = os.path.join(ROOT, ".devtools", "fixtures-form")
FRAMES = os.path.join(OUT, "sheets", "_frames")


def pick(meta):
    n = meta["frames"]
    r = meta["frame_ranges_1based"]
    if "extend" not in r:
        return [1 + round(i * (n - 1) / 5) for i in range(6)]
    ex, rt = r["extend"], r["retract"]
    return [1, ex[0] - 1, (ex[0] + ex[1]) // 2, meta["peak_frame"], (rt[0] + rt[1]) // 2, n]


def main():
    os.makedirs(FRAMES, exist_ok=True)
    with open(os.path.join(OUT, "fixtures.json")) as fh:
        manifest = json.load(fh)
    scn = bpy.context.scene
    scn.render.resolution_x, scn.render.resolution_y = 640, 480
    scn.render.resolution_percentage = 100
    scn.render.image_settings.file_format = "PNG"
    scn.render.use_sequencer = True
    scn.view_settings.view_transform = "Standard"
    se = scn.sequence_editor_create()
    decoded = {}
    for name, meta in manifest.items():
        for s in list(se.sequences_all):
            se.sequences.remove(s)
        st = se.sequences.new_movie(name, os.path.join(OUT, meta["file"]), 1, 1)
        clip = bpy.data.movieclips.load(os.path.join(OUT, meta["file"]))
        decoded[name] = {"frames": st.frame_final_duration, "fps": round(st.fps, 3),
                         "size": list(clip.size), "frames_picked": pick(meta)}
        bpy.data.movieclips.remove(clip)
        scn.frame_start, scn.frame_end = 1, st.frame_final_duration
        for f in pick(meta):
            scn.frame_set(f)
            scn.render.filepath = os.path.join(FRAMES, f"{name}_{f:03d}.png")
            bpy.ops.render.render(write_still=True)
        print("DECODED", name, json.dumps(decoded[name]))
    with open(os.path.join(FRAMES, "decoded.json"), "w") as fh:
        json.dump(decoded, fh, indent=2)


main()
