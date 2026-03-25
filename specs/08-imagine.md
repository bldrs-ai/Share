# Spec: Imagine (AI Rendering)

## Overview
AI-powered architectural rendering. Takes a screenshot of the current 3D view and sends it with a text prompt to an image generation service ("Warhol") to produce stylized architectural renders.

## Key Files
| File | Role |
|------|------|
| `src/Components/Imagine/ImagineControl.jsx` | Toggle button with hash state |
| `src/Components/Imagine/ImagineDialog.jsx` | Dialog: screenshot preview, prompt input, render output |
| `src/Components/Imagine/hashState.js` | URL state: `#im:` prefix |

## Behavior
1. User opens Imagine dialog
2. Current 3D view captured via `viewer.takeScreenshot()`
3. Screenshot displayed as preview
4. User enters a text prompt describing desired style
5. Screenshot + prompt sent to Warhol service via axios
6. Generated image displayed alongside original
7. User can clear and regenerate

## Integration
- Uses `axios` for HTTP calls to the rendering backend
- Screenshot is a data URL from Three.js renderer
- Loading state shown during generation
- Hash state persisted: `#im:` prefix

## State
```javascript
{
  isImagineVisible: boolean  // in Zustand UISlice
}
```
