# Spec: Sunlight Positioning & Rotation

```yaml
id: share-spec-005
status: approved
author: solution-architect
created: 2026-03-22
tracks:
depends-on: []
```

---

## 1. Problem

The Share viewer has a directional light with shadow casting (`LightManager.js`) but the light is hardcoded at position `(-15, 20, -10)` with no user controls. When activated via the Sun toggle in ViewerToolbar, the shadow direction and angle are fixed — users cannot simulate different times of day or orientations to study how sunlight affects their building.

For architectural design review, sun studies are essential: architects need to understand shadow impact on facades, neighbouring buildings, and outdoor spaces at different times and orientations.

## 2. Solution

Add interactive sunlight controls that appear when the light is toggled on:

1. **Azimuth control** — rotate the sun around the building (compass direction, 0–360°)
2. **Elevation control** — raise/lower the sun angle (5–85°)
3. **Animate rotation** — continuously rotate the sun around the building to quickly preview shadows from all directions

The controls appear inline in the ViewerToolbar when the light is active, keeping the interaction close to the toggle that enables it.

## 3. Design

### 3.1 Light Model

The directional light position is derived from **azimuth** and **elevation** angles on a sphere centered on the model:

```
azimuth:   0° = North (+Z), 90° = East (+X), 180° = South (-Z), 270° = West (-X)
elevation: 0° = horizon, 90° = directly overhead
```

Position calculation (spherical to cartesian, radius = 25):

```javascript
const r = 25
const x = r * Math.cos(elevation) * Math.sin(azimuth)
const y = r * Math.sin(elevation)
const z = r * Math.cos(elevation) * Math.cos(azimuth)
light.position.set(x, y, z)
```

The light always points at the scene origin (default Three.js DirectionalLight target).

**Defaults:** azimuth = 315° (northwest), elevation = 25° — low sun casting long dramatic shadows toward the camera. Optimized for the index.ifc "bldrs" building model where the shadow silhouettes reinforce the letter shapes.

### 3.2 UI Controls

When the Sun button is active (light on), expand the ViewerToolbar to show additional controls inline, to the right of the Sun button:

```
[ FitView | Reset | ☀ | ◎ compass dial | ▲ elevation slider ▼ | ↻ | Wireframe | Projection ]
```

| Control | Widget | Range | Details |
|---------|--------|-------|---------|
| Azimuth | Circular compass dial (custom SVG) | 0–360° | ~36px diameter, drag handle rotates around ring, N/E/S/W tick marks, tooltip shows degrees |
| Elevation | MUI Slider (horizontal) | 5–85° | ~60px wide, step 1°, tooltip shows value |
| Animate | IconButton (Lucide `RotateCw`) | toggle | Turns bldrs green when active |

#### Compass Dial Component

A small circular SVG widget (`SunCompass.jsx`) rendered inline in the toolbar:

- **Size:** 36×36px (fits within the 30px row height with minor overflow, matching icon button feel)
- **Ring:** 1px stroke circle in `contrastText` at 0.4 opacity
- **Tick marks:** 4 cardinal ticks (N/E/S/W) as short lines at 0°/90°/180°/270°, labels omitted to keep it compact
- **Handle:** Small filled circle (4px radius) on the ring at the current azimuth angle, `contrastText` color
- **Interaction:** Click or drag anywhere on the dial to set azimuth — compute angle from pointer position relative to dial center using `Math.atan2`
- **Active state:** Handle turns bldrs green (`#00ff00`) when light is on
- **During animation:** Handle moves automatically around the ring in sync with the azimuth value

The compass dial is a new file `src/Components/Sun/SunCompass.jsx` — a small, self-contained SVG component with no external dependencies beyond React.

**Visibility:** The compass dial, elevation slider, and animate button are only rendered when `lightOn === true`. When the light is toggled off, they disappear and the toolbar returns to its compact form.

**Styling:** Elevation slider uses the existing toolbar style — small, muted, same height as icon buttons (30px). Slider track/thumb in `theme.palette.primary.contrastText` at 0.6 opacity, active thumb at full opacity. Same `btnSx` pattern for the animate button. Compass dial follows the same opacity/color conventions.

### 3.3 Animation

When the animate (rotate) button is toggled on:

- Azimuth increments continuously at **~30°/second** (full revolution in ~12 seconds)
- Uses `requestAnimationFrame` for smooth animation
- The compass dial handle moves in sync (reflects current value)
- Elevation remains user-controllable during animation
- Clicking the animate button again (or toggling the light off) stops the animation

Animation loop lives in `LightManager` as `startRotation()` / `stopRotation()` methods.

### 3.4 LightManager Changes

Extend `LightManager.js` with:

```javascript
class LightManager {
  // Existing
  enable() { ... }
  disable() { ... }
  toggle() { ... }

  // New
  setAzimuth(degrees)       // Update sun compass direction
  setElevation(degrees)     // Update sun height angle
  getAzimuth()              // Current azimuth in degrees
  getElevation()            // Current elevation in degrees
  startRotation(onUpdate)   // Begin animation, calls onUpdate(azimuth) each frame
  stopRotation()            // Stop animation
  dispose()                 // Clean up (stop animation, remove light)
}
```

The `enable()` method is updated to accept optional initial azimuth/elevation values, defaulting to 225° / 53°.

`setAzimuth` and `setElevation` recalculate the light position using the spherical-to-cartesian formula from §3.1 and update the shadow camera if needed.

### 3.5 Shadow Camera Auto-Fit

The current shadow camera uses a fixed 60×60m orthographic frustum. When azimuth/elevation change significantly, shadows may fall outside this frustum. To handle this:

- On each position update, recompute the shadow camera frustum to cover the model's bounding box from the new light direction
- Use the model's bounding sphere (available from the loaded geometry) to size the frustum
- Call `light.shadow.camera.updateProjectionMatrix()` after changes

This ensures shadows remain visible at all sun angles without oversizing the shadow map.

### 3.6 State

Light control state is local to ViewerToolbar (React `useState`), same as the existing `lightOn` state. No Zustand slice needed — the light position is a transient visual setting, not shareable state.

State shape in ViewerToolbar:

```javascript
const [lightOn, setLightOn] = useState(false)
const [azimuth, setAzimuth] = useState(225)
const [elevation, setElevation] = useState(53)
const [isRotating, setIsRotating] = useState(false)
```

### 3.7 Files Changed

| File | Change |
|------|--------|
| `src/Infrastructure/LightManager.js` | Add `setAzimuth`, `setElevation`, `startRotation`, `stopRotation`, shadow auto-fit |
| `src/Containers/ViewerToolbar.jsx` | Add compass dial, elevation slider, animate button, wire to LightManager |
| `src/Components/Sun/SunCompass.jsx` | New: circular compass dial SVG component |

## 4. Acceptance Criteria

- [ ] When light is toggled on, compass dial, elevation slider, and animate button appear in ViewerToolbar
- [ ] Dragging the compass dial handle rotates the sunlight around the model; shadows move accordingly
- [ ] Dragging the elevation slider raises/lowers the sun; shadow lengths change accordingly
- [ ] Clicking the animate button starts continuous sun rotation; the compass dial reflects the current angle
- [ ] Clicking animate again stops the rotation at the current position
- [ ] Toggling the light off hides all sun controls and stops any animation
- [ ] Shadows remain visible (no clipping) at all azimuth/elevation combinations
- [ ] Default sun position (225° / 53°) matches approximately the current hardcoded position
- [ ] Controls follow existing toolbar styling (30px height, muted opacity, green active state)

## 5. Out of Scope

- **Geographic sun position** (lat/lon + date/time → solar angle) — future enhancement
- **Sun path diagram** overlay on the viewport
- **Multiple light sources** or point lights
- **Ambient light controls** (the built-in ambient light from web-ifc-viewer stays as-is)
- **URL hash persistence** of sun position — not needed for transient visual settings
- **Shadow quality settings** (map resolution, bias) — current 2048×2048 PCF is sufficient

## 6. Open Questions

None — resolved during review:
- **Azimuth control:** Circular compass dial (approved over horizontal slider)
- **Animation speed:** 30°/s / 12s per revolution (approved)
