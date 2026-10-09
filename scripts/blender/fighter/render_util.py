"""Small Workbench render helpers used to visually verify the fighter."""
import math

import bpy
from mathutils import Vector


def setup(res=(800, 1000), bg=(0.93, 0.93, 0.93)):
    """Eevee preview render (shows materials + vertex-colour tint like a
    glTF viewer would)."""
    scn = bpy.context.scene
    scn.render.engine = "BLENDER_EEVEE"
    scn.render.resolution_x, scn.render.resolution_y = res
    scn.render.resolution_percentage = 100
    scn.render.film_transparent = False
    scn.eevee.taa_render_samples = 16
    scn.eevee.use_gtao = True
    scn.eevee.use_soft_shadows = True
    if scn.world is None:
        scn.world = bpy.data.worlds.new("World")
    w = scn.world
    w.use_nodes = True
    bgn = w.node_tree.nodes.get("Background")
    bgn.inputs["Color"].default_value = (*bg, 1)
    bgn.inputs["Strength"].default_value = 0.55
    scn.view_settings.view_transform = "Filmic"
    scn.view_settings.look = "Medium Contrast"
    scn.render.image_settings.file_format = "PNG"
    if not bpy.data.objects.get("_Key"):
        for name, rot, energy in (("_Key", (50, 0, -35), 3.2), ("_Fill", (60, 0, 140), 1.2), ("_Rim", (70, 0, 200), 2.0)):
            sun = bpy.data.objects.new(name, bpy.data.lights.new(name, "SUN"))
            sun.data.energy = energy
            sun.data.angle = 0.2
            sun.rotation_euler = [math.radians(a) for a in rot]
            scn.collection.objects.link(sun)


def camera(loc, target, lens=50.0, ortho=None):
    cam = bpy.data.objects.get("_RenderCam")
    if cam is None:
        cam = bpy.data.objects.new("_RenderCam", bpy.data.cameras.new("_RenderCam"))
        bpy.context.scene.collection.objects.link(cam)
    cam.location = Vector(loc)
    d = Vector(target) - Vector(loc)
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    if ortho:
        cam.data.type = "ORTHO"
        cam.data.ortho_scale = ortho
    else:
        cam.data.type = "PERSP"
        cam.data.lens = lens
    cam.data.clip_start = 0.05
    cam.data.clip_end = 100
    bpy.context.scene.camera = cam
    return cam


def orbit(target, dist, yaw_deg, pitch_deg=5.0, lens=50.0):
    """Camera around target. yaw 0 = in front of the character (-Y)."""
    yaw, pitch = math.radians(yaw_deg), math.radians(pitch_deg)
    off = Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
    return camera(Vector(target) + off * dist, target, lens)


def render(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def floor(size=6.0, z=0.0):
    if bpy.data.objects.get("_Floor"):
        return
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, z))
    fl = bpy.context.active_object
    fl.name = "_Floor"
    mat = bpy.data.materials.new("_FloorMat")
    mat.use_nodes = True
    mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.35, 0.36, 0.38, 1)
    mat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.9
    fl.data.materials.append(mat)


def remove_helpers():
    for name in ("_RenderCam", "_Floor", "_Key", "_Fill", "_Rim"):
        ob = bpy.data.objects.get(name)
        if ob:
            bpy.data.objects.remove(ob)
