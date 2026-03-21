# Spec: SVG Floor Plan Editor

```yaml
id: share-spec-002
status: approved
author: solution-architect
created: 2026-03-21
tracks:
depends-on: [share-spec-001]
```

---

## 1. Problem

The Floor Plan View (share-spec-001) provides a 3D top-down clipped view, but users need a true 2D vector floor plan that they can:
- Annotate with measurements and dimension lines
- Export as SVG files for documentation, printing, or CAD workflows
- Use as a base for area calculations, space planning, and construction documentation

The 3D clipped view cannot be annotated, measured precisely, or exported as clean vector graphics.

## 2. Solution

Add an **SVG Floor Plan Editor** that:
1. Extracts 2D wall/column/space outlines from the IFC model at a given storey elevation
2. Renders them as an interactive SVG in a dedicated panel
3. Provides measurement tools (point-to-point distance, area measurement)
4. Allows drawing dimension lines and annotations
5. Saves SVG files locally (with annotations baked in)

## 3. Design

### 3.1 Geometry Extraction

Extract 2D footprints from the IFC model for a given storey:

**From Conway's data-only parser (no WASM):**
- For each element on the storey, traverse `IfcProduct.Representation` → `IfcShapeRepresentation`
- Find `IfcExtrudedAreaSolid` → `SweptArea` (the 2D profile)
- Transform profile points by the element's `IfcLocalPlacement` to get world XZ coordinates
- For `IfcRectangleProfileDef`: generate 4-corner rectangle
- For `IfcArbitraryClosedProfileDef` with `IfcPolyline`: extract point coordinates
- Project to 2D: use X,Z from 3D (Y is up in viewer, Z is depth)

**Element types to extract:**
- `IfcWall` → thick outline (wall footprint)
- `IfcColumn` → filled shape (column cross-section)
- `IfcDoor` → arc symbol at opening
- `IfcWindow` → thin line at opening
- `IfcSpace` → light fill with label
- `IfcSlab` (FLOOR) → outer boundary

### 3.2 SVG Rendering

**Coordinate system:**
- SVG viewBox maps to the storey's XZ bounding box (with padding)
- Y-axis flipped (SVG Y goes down, building Z goes up in plan)
- Scale indicator shown in corner

**Layer structure (CSS classes for styling):**
```svg
<g class="layer-slabs">      <!-- floor slab outlines -->
<g class="layer-walls">      <!-- wall footprints (thick) -->
<g class="layer-columns">    <!-- column cross-sections -->
<g class="layer-openings">   <!-- door arcs, window lines -->
<g class="layer-spaces">     <!-- room fills + labels -->
<g class="layer-dimensions">  <!-- user-drawn measurements -->
<g class="layer-annotations"> <!-- user text labels -->
```

### 3.3 Measurement Tools

**Point-to-point distance:**
- User clicks two points on the SVG
- A dimension line appears with the distance in meters
- Snaps to wall corners, endpoints, midpoints

**Area measurement:**
- User clicks multiple points to define a polygon
- Shows the area in m² inside the polygon
- Close polygon by clicking first point or double-click

**Dimension line style:**
- Horizontal/vertical dimension lines with extension lines and arrows
- Distance value displayed above the line
- Follows architectural drawing conventions

### 3.4 Annotation Tools

- **Text labels**: click to place, type text
- **Leader lines**: arrow pointing to a location with text
- **Dimension lines**: drawn between two points with automatic distance

### 3.5 Save/Export

- **Save as SVG**: downloads the complete SVG including geometry + annotations
- SVG includes metadata: model name, storey name, scale, date
- Annotations are separate `<g>` layers so they can be toggled in vector editors
- Future: save to GitHub repository

### 3.6 UI Integration

**New panel**: Opens as a side drawer or full-screen overlay when activated from the Floor Plans menu.

**Controls:**
- Tool selector: Select / Measure Distance / Measure Area / Add Text
- Layer toggles: show/hide walls, spaces, dimensions, annotations
- Scale selector: 1:50, 1:100, 1:200
- Export button: Save SVG

### 3.7 File Structure

```
Share/src/
  Components/FloorPlan/
    SVGFloorPlan/
      SVGFloorPlanView.jsx        # Main SVG viewport component
      SVGFloorPlanView.test.jsx
      GeometryExtractor.js        # IFC → 2D polygon extraction
      GeometryExtractor.test.js
      SVGRenderer.js              # Polygons → SVG elements
      SVGRenderer.test.js
      MeasurementTool.js          # Point-to-point and area measurement
      MeasurementTool.test.js
      DimensionLine.js            # SVG dimension line rendering
      AnnotationManager.js        # Text labels, leader lines
      ExportManager.js            # SVG file generation and download
      svgStyles.css               # Architectural drawing styles
```

## 4. Acceptance Criteria

1. GIVEN a loaded IFC model with storeys WHEN the user opens the SVG floor plan for a storey THEN wall outlines, columns, and spaces are rendered as SVG
2. GIVEN the SVG floor plan is displayed WHEN the user selects the distance measurement tool and clicks two points THEN a dimension line with distance in meters appears
3. GIVEN the SVG floor plan is displayed WHEN the user selects the area measurement tool and clicks 3+ points THEN a polygon with area in m² is shown
4. GIVEN the SVG floor plan has measurements WHEN the user clicks Export SVG THEN an SVG file is downloaded containing geometry and all annotations
5. GIVEN the SVG floor plan WHEN the user toggles a layer off THEN those elements are hidden in the view and excluded from export
6. GIVEN an IFC model with IfcSpace entities WHEN the SVG is generated THEN each space shows its name as a centered label
7. GIVEN walls with rectangular profiles WHEN the SVG is generated THEN wall thickness is accurately represented

## 5. Out of Scope

- GitHub repository save (future phase)
- PDF export
- Hatching patterns for wall sections
- Furniture/fixture display
- Multi-storey overlay
- Curved wall profiles (polyline approximation only)

8. GIVEN the measurement tool is active WHEN the user clicks near a wall corner or midpoint THEN the click snaps to the nearest geometry endpoint

## 6. Open Questions

*All resolved — sponsor decisions:*
- Side panel (not full-screen overlay)
- Snap to geometry endpoints only (no grid snapping)
- Default scale 1:100
