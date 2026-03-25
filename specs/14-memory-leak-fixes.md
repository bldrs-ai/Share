# Spec: Memory Leak Fixes (Completed)

## Overview
8 memory leak sources found and fixed across 11 files. Primary cause: old Three.js viewer instances never disposed when loading new models.

## Fixes Applied

### Critical
1. **Viewer disposal** — `disposeViewer()` added; `initViewer()` auto-disposes previous viewer
2. **Theme listener accumulation** — `removeThemeChangeListener()` added; old listener removed before new registration

### High
3. **Canvas event listener accumulation** — `onLoad()` returns cleanup function; useEffect returns it
4. **Hash listener accumulation** — `removeHashListener(name)` implemented
5. **Object URL leaks** — `URL.revokeObjectURL()` added in 4 locations

### Medium
6. **MessageChannel port leak** — `dispose()` method on `IFrameCommunicationChannel`
7. **Notes edit state growth** — `setDeletedNotes` now prunes edit state maps
8. **setTimeout accumulation** — `clearTimeout()` before scheduling new snack timeout

## Files Changed
| File | Change |
|------|--------|
| `src/Containers/viewer.js` | `disposeViewer()`, auto-dispose in `initViewer()` |
| `src/Containers/CadView.jsx` | Theme listener cleanup |
| `src/theme/Theme.jsx` | `removeThemeChangeListener()` |
| `src/Components/Camera/CameraControl.jsx` | useEffect cleanup, proper listener removal |
| `src/utils/location.js` | `removeHashListener()` |
| `src/Components/Apps/AppsMessagesHandler.js` | `dispose()` method |
| `src/Components/Apps/AppIFrame.jsx` | Channel lifecycle via ref |
| `src/utils/loader.js` | `revokeObjectURL()` in 3 functions |
| `src/OPFS/utils.js` | `revokeObjectURL()` in `saveDnDFileToOpfs` |
| `src/store/NotesSlice.js` | Prune edit state on deletion |
| `src/Components/Open/SaveModelControl.jsx` | Deduplicate snack timeouts |
