# Spec: Floor Plan View

```yaml
id: share-spec-001
status: implementing
author: solution-architect
created: 2026-03-21
tracks:
depends-on: []
```

---

## 1. Problem

Share's 3D viewer has no way to view a building floor-by-floor in a top-down 2D plan view. Users working on architectural coordination, space planning, or quantity verification need to see individual floors as flat plan views with clear wall outlines and room layouts — the standard way architects review buildings.

The building blocks exist (clipping planes, storey detection via `getByFloor()`, element visibility via `IfcIsolator`) but there is no orchestration layer that combines them into a floor plan experience.

## 2. Solution

Add a **Floor Plan mode** to Share that:
1. Enumerates all `IfcBuildingStorey` entities with their elevations
2. Lets the user select a floor from a storey selector
3. Transitions the view to a top-down orthographic camera showing only that floor
4. Applies two horizontal clipping planes to slice the storey at the architectural cut height (~1.2m above floor)
5. Locks camera to pan/zoom only (no rotation)
6. Persists the floor plan state in the URL hash for shareability

## 3. Design

### 3.1 State

New Zustand slice: `FloorPlanSlice.js`

```javascript
{
  isFloorPlanMode: false,         // Whether floor plan mode is active
  setIsFloorPlanMode: (bool) => ...,
  currentFloorIndex: null,        // Index into floors array
  setCurrentFloorIndex: (idx) => ...,
  floors: [],                     // [{globalId, name, elevation, nextElevation}]
  setFloors: (floors) => ...,
}
```

### 3.2 Floor Enumeration

On model load, extract storeys from the spatial structure:

```javascript
const structure = await manager.getSpatialStructure(0, true)
// Walk tree, collect IFCBUILDINGSTOREY nodes
// Sort by Elevation ascending
// Compute nextElevation from the storey above (or elevation + default 3m for top floor)
// Store as floors[] in state
```

Reuse existing `IfcViewerAPIExtended.getByFloor()` logic.

### 3.3 Camera

Create an `OrthographicCamera` that matches the canvas aspect ratio:

```javascript
const aspect = canvas.width / canvas.height
const frustumSize = storeyBoundingBoxWidth * 1.1  // 10% padding
const orthoCamera = new THREE.OrthographicCamera(
  -frustumSize * aspect / 2, frustumSize * aspect / 2,
  frustumSize / 2, -frustumSize / 2,
  0.1, 1000
)
```

Position: `(center.x, elevation + 100, center.z)` looking straight down at `(center.x, elevation, center.z)`.

On enter: store current perspective camera state for restoration.
On exit: restore perspective camera position/target.

### 3.4 Clipping

Two horizontal clipping planes per storey:

- **Bottom plane**: `normal = (0, 1, 0)`, `point = (0, elevation, 0)` — clips everything below the floor
- **Top plane**: `normal = (0, -1, 0)`, `point = (0, elevation + cutHeight, 0)` — clips everything above the cut

Default `cutHeight = 1.2m` above floor elevation (standard architectural section height — cuts through windows, above doors). User-adjustable via a slider (range: 0.1m to storey height).

Use existing `GlbClipper` / `viewer.clipper` infrastructure.

### 3.5 Controls

In floor plan mode:
- **Pan**: left-click drag (or touch drag)
- **Zoom**: scroll wheel (adjusts ortho frustum size)
- **No rotation**: disable orbit controls
- **Click-to-select**: raycasting works same as 3D — clicking an element selects it and shows properties in the side panel
- **Escape** or button click: exit floor plan mode

### 3.5a Grid Overlay

Show a subtle grid aligned to the floor plane:
- Grid lines at 1m intervals (thin, `--border-light` color)
- Major grid lines at 5m intervals (slightly brighter)
- Grid adapts to zoom level (hide fine lines when zoomed out)
- Use `THREE.GridHelper` positioned at floor elevation

### 3.5b Cut Height Slider

A small slider in the floor selector panel:
- Range: 0.1m to storey height (nextElevation - elevation)
- Default: 1.2m
- Shows current value in meters
- Updates top clipping plane in real time as user drags

### 3.6 UI Components

**FloorPlanControl** (`src/Components/FloorPlan/FloorPlanControl.jsx`):
- Button in `LeftToolbar.jsx` using `PlanView.svg` or `Levels.svg` icon
- On click: opens floor selector dropdown
- Shows list of floors with name + elevation
- Active floor highlighted
- "Exit" button to return to 3D

### 3.7 URL Hash

```
#fp:{floorIndex}
```

Example: `#c:-26,12,30,-5,3,-1;fp:2` — camera position + floor plan of 3rd floor.

On page load with `fp:` in hash: auto-enter floor plan mode for that floor.

### 3.8 File Structure

```
Share/src/
  Components/FloorPlan/
    FloorPlanControl.jsx          # Toolbar button + floor selector + cut height slider
    FloorPlanControl.test.jsx     # Tests
    FloorPlanManager.js           # Camera, clipping, grid, controls orchestration
    FloorPlanManager.test.js      # Tests
    hashState.js                  # URL hash read/write for fp: param
    hashState.test.js             # Tests
  store/
    FloorPlanSlice.js             # Zustand state slice
```

## 4. Acceptance Criteria

1. GIVEN a loaded IFC model with IfcBuildingStorey entities WHEN the user clicks the floor plan button THEN a list of floors with names and elevations is shown
2. GIVEN the floor selector is open WHEN the user selects a floor THEN the view transitions to a top-down orthographic view of that floor with clipping planes applied
3. GIVEN floor plan mode is active WHEN the user pans or zooms THEN the view updates without allowing rotation
4. GIVEN floor plan mode is active WHEN the user presses Escape or clicks Exit THEN the view returns to the previous 3D perspective camera position
5. GIVEN floor plan mode is active WHEN the user selects a different floor THEN the clipping planes and camera adjust to the new floor
6. GIVEN a URL with `#fp:2` WHEN the page loads with a model THEN floor plan mode activates automatically for floor index 2
7. GIVEN floor plan mode is active WHEN the user copies the URL THEN it includes the `fp:` parameter for the current floor
8. GIVEN an IFC model without IfcBuildingStorey entities WHEN the user clicks the floor plan button THEN a message indicates no floors were found

9. GIVEN floor plan mode is active WHEN the user adjusts the cut height slider THEN the top clipping plane moves accordingly and the view updates
10. GIVEN floor plan mode is active THEN a subtle grid overlay is shown aligned to the floor plane
11. GIVEN floor plan mode is active WHEN the user clicks an element THEN the element is selected and its properties are shown (same as 3D selection)

## 5. Out of Scope

- 2D SVG floor plan rendering (separate future feature)
- Dimension/measurement overlays on the plan view
- Space labels or area annotations
- Floor plan export (PDF, image)
- Multi-storey comparison view

## 6. Open Questions

*All resolved — sponsor approved yes to all.*
