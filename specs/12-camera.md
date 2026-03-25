# Spec: Camera Control

## Overview
Camera interaction handling: orbit, pan, zoom via mouse/touch. Camera position encoded in URL for sharing. Keyboard shortcuts for clipper operations.

## Key Files
| File | Role |
|------|------|
| `src/Components/Camera/CameraControl.jsx` | Event listeners: mousemove, wheel, mouseup, touchend |
| `src/Components/Camera/hashState.js` | Camera hash: `#c:px,py,pz,tx,ty,tz` |
| `src/utils/shortcutKeys.js` | Keyboard shortcuts: Q=create plane, W=delete plane |

## URL Hash Format
```
#c:-133.022,131.828,161.85,-38.078,22.64,-2.314
```
6 floats: camera position (x,y,z) + target (x,y,z).

## Behavior
- Camera state read from/written to URL hash on navigation events
- `onHash()` restores camera from URL on load
- `addCameraUrlParams()` writes current camera to hash
- Mouse/touch events update camera controls and trigger hash updates
- Wheel events debounced via `document.wheeling` (non-standard, should use ref)
- `hashListener` registered for cross-component hash change events

## Known Issues
- `document.wheeling` non-standard property for debounce (should be a ref)
- Canvas event listeners previously accumulated on re-render (fixed in memory leak pass)
- Hash listeners previously never removed (fixed in memory leak pass)
