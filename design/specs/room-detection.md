# Spec: Automatic Room Detection from Wall Geometry

```yaml
id: share-spec-004
status: approved
author: solution-architect
created: 2026-03-22
tracks:
depends-on: [share-spec-001, share-spec-002]
```

---

## 1. Problem

Most IFC files lack IfcSpace entities, so room boundaries and floor areas are unknown. Users need automatic room detection to:
- See individual room areas on the SVG floor plan
- Visualize rooms as colored regions in the 3D model
- Calculate floor areas per room for quantity takeoff and compliance checks

## 2. Solution

A **planar graph algorithm** that:
1. Extracts wall centerlines from the model geometry
2. Builds a planar graph with intersection detection
3. Finds all enclosed faces (rooms) via boundary traversal
4. Calculates room areas and displays them in both the SVG floor plan and the 3D viewer

## 3. Design

### 3.1 Wall Centerline Extraction

For each wall on the storey:
- Get the bounding box from scene mesh vertices (already available)
- Determine the wall's long axis (length > thickness)
- Extract the centerline as a 2D line segment [x1,z1] → [x2,z2]
- Store wall thickness for later inner-face offset

```
Wall bounding box:         Centerline:
┌──────────────┐           ────────────
│              │    →      (midline along longest edge)
└──────────────┘
```

### 3.2 Planar Graph Construction

1. **Collect all centerline segments**
2. **Find all pairwise intersections**: for each pair of segments, compute intersection point (if any)
3. **Split segments at intersections**: each original segment becomes multiple sub-edges
4. **Snap endpoints**: merge nodes within tolerance (5cm) to handle imperfect geometry
5. **Build adjacency list**: node → sorted list of outgoing edges (sorted by angle)

### 3.3 Face Detection (Room Finding)

The **planar face traversal** algorithm:

```
For each directed edge (u → v) not yet used:
  1. Start a new face boundary
  2. At node v, find the next edge by turning CCW (next edge in angular order after the reverse direction)
  3. Follow that edge to the next node
  4. Repeat until returning to the starting edge
  5. The traced boundary = one face of the planar graph
```

This produces all faces including the outer (unbounded) face. Discard the face with the largest area (the exterior).

### 3.4 Room Classification

Each detected face is a potential room:
- Calculate area via shoelace formula
- Discard faces smaller than 0.5 m² (noise from wall intersections)
- Discard the largest face (exterior)
- Remaining faces = rooms

### 3.5 Area Calculation

For each room polygon:
- **Centerline area**: direct from polygon (wall centerline boundary)
- **Net area** (inner face): offset each edge inward by half wall thickness
- **Gross area** (outer face): offset outward by half wall thickness

### 3.6 SVG Display

On the SVG floor plan:
- Fill each room polygon with a distinct color (semi-transparent)
- Show area label (m²) at centroid
- Auto-assign room numbers (Room 1, Room 2, ...)
- User can click a room to rename it

### 3.7 3D Model Display

In the 3D viewer:
- Create a flat colored mesh for each room polygon at the storey elevation
- Semi-transparent fill (like a floor overlay)
- Shows room area label as a 3D text sprite
- Visible in both floor plan mode and normal 3D view
- Toggle on/off via a "Show Rooms" button

### 3.8 File Structure

```
Share/src/Components/FloorPlan/
  RoomDetection/
    WallCenterlines.js        # Extract centerlines from wall bounding boxes
    WallCenterlines.test.js
    PlanarGraph.js             # Build graph, find intersections, snap nodes
    PlanarGraph.test.js
    FaceDetection.js           # Find enclosed faces via boundary traversal
    FaceDetection.test.js
    RoomDetector.js            # Orchestrator: walls → centerlines → graph → rooms
    RoomDetector.test.js
```

## 4. Acceptance Criteria

1. GIVEN a storey with walls forming enclosed rooms WHEN room detection runs THEN each enclosed area is identified as a separate room with its area in m²
2. GIVEN detected rooms WHEN the SVG floor plan renders THEN each room is filled with a distinct color and labeled with its area
3. GIVEN detected rooms WHEN "Show Rooms" is enabled in 3D THEN colored floor overlays appear at the storey elevation
4. GIVEN walls that don't perfectly meet (gaps < 5cm) WHEN room detection runs THEN the gap is bridged and the room is still detected
5. GIVEN a room polygon WHEN area is calculated THEN the centerline area matches manual measurement within 2%
6. GIVEN the exterior boundary WHEN room detection completes THEN it is correctly identified and excluded from rooms

## 5. Out of Scope

- Curved wall room detection (polyline approximation only)
- Multi-storey room detection (atriums, voids)
- Room naming from IfcSpace properties (future: match detected rooms to IfcSpace if available)
- Door/window detection for room connectivity analysis

## 6. Open Questions

*None — sponsor approved the approach.*
