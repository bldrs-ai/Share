# Spec: Versions (Git History)

## Overview
Git commit history timeline for the loaded IFC file. Users can navigate between versions of a model by clicking commits in a timeline UI.

## Key Files
| File | Role |
|------|------|
| `src/Components/Versions/VersionsPanel.jsx` | Timeline panel, commit navigation |
| `src/Components/Versions/VersionsTimeline.jsx` | Visual timeline component |
| `src/Components/Versions/useVersions.js` | Hook: fetches commits for a file path |
| `src/store/VersionsSlice.js` | Zustand: versions visibility state |

## Behavior
1. Panel shows commit history for the current file path
2. Each commit displayed in a timeline with SHA, message, date
3. Clicking a commit navigates to that version of the model
4. "Reset to main" button returns to HEAD of default branch
5. Current commit highlighted in timeline

## GitHub Integration
- Fetches commits via GitHub API for `{org}/{repo}/{filepath}`
- Requires `accessToken` for private repos
- Uses `modelPath` to construct navigation paths
- Navigation via react-router: `navigateBaseOnModelPath(org, repo, sha, filepath)`

## State
```javascript
{
  isVersionsVisible: boolean
}
```
