# Memory Leak Analysis & Fixes

> Investigation and fixes originally by @MarkusSteinbrecher in [#1477](https://github.com/bldrs-ai/Share/pull/1477); cherry-picked here as a focused PR. Fix #1 also extended with `WebGLRenderer.forceContextLoss()`, an optional call to the viewer's built-in `dispose()`, and disposal of additional texture-map slots (`normalMap`, `roughnessMap`, `metalnessMap`, `emissiveMap`, `aoMap`, `bumpMap`, `displacementMap`, `alphaMap`, `lightMap`, `envMap`).

## Overview

Investigation into increasing Chrome resource usage when running Share for extended periods and loading multiple models. Found 8 memory leak sources across 11 files.

---

## Critical (largest impact)

### 1. Old Three.js viewer never disposed

**Files:** `src/Containers/viewer.js`, `src/Containers/CadView.jsx`

When loading a new model, `initViewer()` created a fresh `IfcViewerAPIExtended` but never called `dispose()` on the previous one. The old WebGL context, renderer, geometries, materials, and textures all stayed in GPU/browser memory. `container.textContent = ''` only removed the canvas DOM element but did not free WebGL resources.

This is the primary cause of increasing Chrome resource usage when loading multiple models.

**Fix:** Added `disposeViewer()` that calls `viewer.dispose()` and clears global event handlers before creating a new viewer. `initViewer()` now automatically disposes the previous viewer.

### 2. Theme change listeners accumulate

**Files:** `src/Containers/CadView.jsx`, `src/theme/Theme.jsx`

Every call to `onModelPath()` added a new theme change listener via `theme.addThemeChangeListener(initViewerCb)` without removing the previous one. Over time, multiple stale callbacks accumulated in the `themeChangeListeners` object, each capturing old viewer instances in closure and preventing garbage collection.

**Fix:** Added `removeThemeChangeListener()` to Theme.jsx. CadView now removes the previous listener before registering a new one.

---

## High (significant leaks)

### 3. Canvas event listeners accumulate

**File:** `src/Components/Camera/CameraControl.jsx`

The `onLoad()` function added `mousemove`, `wheel`, `mouseup`, and `touchend` listeners to the canvas element on every `useEffect` re-run. The previous `removeEventListener` calls used different function references than the ones added, so they were ineffective. Listeners accumulated on the canvas over time.

**Fix:** `onLoad()` now returns a cleanup function that removes all added listeners. The `useEffect` returns this cleanup so React calls it on re-render and unmount.

### 4. Hash listeners never removed

**File:** `src/utils/location.js`

`addHashListener()` stored callbacks in a module-level `hashListeners` object but had no corresponding removal mechanism (the code had a `TODO: add remove method` comment). Listeners accumulated across component lifecycles.

**Fix:** Implemented `removeHashListener(name)` and used it in the CameraControl cleanup function.

### 5. Object URLs never revoked

**Files:** `src/utils/loader.js`, `src/OPFS/utils.js`

`URL.createObjectURL()` was called in 4 places without corresponding `URL.revokeObjectURL()` calls. Each unreleased object URL keeps the underlying file data blob pinned in browser memory until page reload. With multiple file loads, this accumulates significantly.

**Locations fixed:**
- `loadLocalFileFallback()` in loader.js
- `loadLocalFile()` in loader.js
- `saveDnDFileToOpfsFallback()` in loader.js
- `saveDnDFileToOpfs()` in OPFS/utils.js

**Fix:** Added `URL.revokeObjectURL()` calls after extracting the blob ID from the URL.

---

## Medium

### 6. MessageChannel ports never closed

**Files:** `src/Components/Apps/AppsMessagesHandler.js`, `src/Components/Apps/AppIFrame.jsx`

`IFrameCommunicationChannel` created a `MessageChannel` with two ports but had no destructor or cleanup method. The ports, message handlers, and iframe references were never released. Instances were created in a callback ref but never stored for later cleanup.

**Fix:** Added a `dispose()` method to `IFrameCommunicationChannel` that nulls the `onmessage` handler, closes the port, and releases references. `AppIFrame` now tracks the channel instance via a ref and disposes it on unmount or before creating a new one.

### 7. Notes edit state grows unbounded

**File:** `src/store/NotesSlice.js`

The `editBodies`, `editModes`, and `editOriginalBodies` objects in Zustand state accumulated entries keyed by note ID for every note ever edited during a session. When notes were deleted via `setDeletedNotes`, the corresponding entries in these objects were never pruned.

**Fix:** `setDeletedNotes` now also removes the deleted note's entries from `editBodies`, `editModes`, and `editOriginalBodies`.

### 8. Orphaned setTimeout accumulation

**File:** `src/Components/Open/SaveModelControl.jsx`

Multiple `setTimeout()` calls for clearing snack messages were fired without storing or clearing previous timer IDs. Rapid saves could queue up many timeout callbacks, each trying to set state on potentially unmounted components.

**Fix:** Track the timeout ID in a module-level variable and call `clearTimeout()` before scheduling a new one, ensuring only one timeout is active at a time.

---

## Files Changed

| File | Change |
|------|--------|
| `src/Containers/viewer.js` | Added `disposeViewer()`, auto-dispose in `initViewer()` |
| `src/Containers/CadView.jsx` | Theme listener cleanup, import `disposeViewer` |
| `src/theme/Theme.jsx` | Added `removeThemeChangeListener()` |
| `src/Components/Camera/CameraControl.jsx` | useEffect cleanup, proper listener removal |
| `src/utils/location.js` | Added `removeHashListener()` |
| `src/Components/Apps/AppsMessagesHandler.js` | Added `dispose()` method |
| `src/Components/Apps/AppIFrame.jsx` | Channel lifecycle management via ref |
| `src/utils/loader.js` | `URL.revokeObjectURL()` in 3 functions |
| `src/OPFS/utils.js` | `URL.revokeObjectURL()` in `saveDnDFileToOpfs` |
| `src/store/NotesSlice.js` | Prune edit state on note deletion |
| `src/Components/Open/SaveModelControl.jsx` | Deduplicate snack timeouts |
