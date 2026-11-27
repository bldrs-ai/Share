"""Regenerate building-b.ifc.gz with IfcOpenShell 0.9.0.post1.

Run from the repo root with the IFC2X3 b.ifc from bldrs-ai/test-models.
The preview replaces the first IFC4 logo block's mesh and keeps its identity.
Only the exterior / visible element geometry and materials cross the schema
boundary. Windows and wall openings are meshed by IfcOpenShell before fitting
the building into the existing logo's footprint.
"""

from collections import defaultdict
from hashlib import sha256
from pathlib import Path
import gzip
import sys

import ifcopenshell
import ifcopenshell.geom
import numpy as np


source = Path(sys.argv[1])
assert sha256(source.read_bytes()).hexdigest() == (
    "094e7b1ed9b6f478b123f2be603069c48485a3c4570c53023b6f98f04b6352de"
)
fixture = Path(__file__).parent
original = ifcopenshell.file.from_string(gzip.decompress((fixture / "original.ifc.gz").read_bytes()).decode())
redesign = ifcopenshell.open(str(source))
block = original.by_guid("3vMqyUfHj3tgritpIZS4iG")
body, bbox = block.Representation.Representations
bounds = bbox.Items[0]

settings = ifcopenshell.geom.settings()
settings.set("use-world-coords", True)
meshes = []
for element in redesign.by_type("IfcElement"):
    if element.is_a("IfcOpeningElement") or not element.Representation:
        continue
    shape = ifcopenshell.geom.create_shape(settings, element)
    geometry = shape.geometry
    vertices = np.array(geometry.verts).reshape(-1, 3)
    if vertices.size:
        colors = []
        for material in geometry.materials:
            rgb = material.diffuse
            colors.append((rgb.r(), rgb.g(), rgb.b(), material.transparency or 0.0))
        meshes.append((vertices, list(zip(*[iter(geometry.faces)] * 3)),
                       geometry.material_ids, colors))

points = np.concatenate([vertices for vertices, *_ in meshes])
minimum = points.min(axis=0)
size = points.max(axis=0) - minimum
footprint = np.array((bounds.XDim, bounds.YDim, bounds.ZDim))
scale = min(footprint / size)
offset = np.array(bounds.Corner.Coordinates) + (footprint - size * scale) * (0.5, 0.5, 0)

# A single IFC4 proxy keeps the block's GUID and its place in the nav tree.
# Group triangles by source material so the preview keeps its finishes.
triangles = defaultdict(list)
for vertices, faces, material_ids, colors in meshes:
    moved = ((vertices - minimum) * scale + offset).round(6).tolist()
    for face, material_id in zip(faces, material_ids, strict=True):
        color = colors[material_id] if material_id >= 0 else (0.7, 0.7, 0.7, 0.0)
        triangles[color].append(tuple(tuple(moved[index]) for index in face))

items = []
for (r, g, b, transparency), faces in triangles.items():
    indices = {}
    coords = [tuple(indices.setdefault(vertex, len(indices) + 1) for vertex in face)
              for face in faces]
    points = original.create_entity("IfcCartesianPointList3D", list(indices))
    mesh = original.create_entity("IfcTriangulatedFaceSet", points, None, False, coords)
    color = original.create_entity("IfcColourRgb", None, r, g, b)
    rendering = original.create_entity("IfcSurfaceStyleRendering", color, Transparency=transparency,
                                       ReflectanceMethod="NOTDEFINED")
    style = original.create_entity("IfcSurfaceStyle", "Redesigned B", "BOTH", [rendering])
    original.create_entity("IfcStyledItem", mesh, [style])
    items.append(mesh)

body.Items = items
for aspect in block.Representation.HasShapeAspects:
    for representation in aspect.ShapeRepresentations:
        representation.Items = items
block.Name = "Redesigned B building"
output = fixture / "building-b.ifc.gz"
output.write_bytes(gzip.compress(original.to_string().encode(), mtime=0))
