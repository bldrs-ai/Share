# Spec: Share (URL State & Collaboration)

## Overview
Shareable URLs encode the full viewer state: camera position, cut plane positions, selected elements, notes, and app state. QR code generation for mobile sharing.

## Key Files
| File | Role |
|------|------|
| `src/Components/Share/ShareDialog.jsx` | Share dialog: toggles for camera/planes in URL, copy button, QR code |
| `src/Components/Camera/CameraControl.jsx` | `addCameraUrlParams()` — encodes camera to hash |
| `src/Components/Camera/hashState.js` | Camera hash: `#c:x,y,z,tx,ty,tz` |
| `src/Components/CutPlane/hashState.js` | CutPlane hash: `#cp:y=17.077,x=-25.551` |
| `src/Components/Notes/hashState.js` | Notes hash: `#i:` prefix |
| `src/utils/location.js` | Core hash param utilities: add/get/remove hash params |
| `src/store/ShareSlice.js` | Zustand: share state |

## URL Hash Format
Multiple state tokens concatenated with `;`:
```
#cp:y=17.077,x=-25.551,z=5.741;c:-133.022,131.828,161.85,-38.078,22.64,-2.314;i:42
```

| Prefix | Content |
|--------|---------|
| `c:` | Camera position + target (6 floats) |
| `cp:` | Cut plane offsets per axis |
| `i:` | Selected note/issue ID |
| `ic:` | Selected comment ID |

## Behavior
- Share dialog opens with current URL
- Toggles to include/exclude camera position and cut planes
- Copy-to-clipboard button
- QR code rendered via `react-qr-code`
- Open Graph / Helmet meta tags updated for social preview
- Camera and plane state added/removed dynamically as user toggles
