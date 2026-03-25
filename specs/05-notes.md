# Spec: Notes (Annotations / Issues)

## Overview
GitHub Issues-backed annotation system. Notes are stored as GitHub issues with embedded 3D placemark coordinates. Users can create, edit, delete notes with camera position + marker placement linked to model locations.

## Key Files
| File | Role |
|------|------|
| `src/Components/Notes/NotesControl.jsx` | Main control: fetches issues, manages markers, toggle visibility |
| `src/Components/Notes/NoteCard.jsx` | Individual note card with edit/delete actions |
| `src/Components/Notes/NoteContent.jsx` | Note body rendering |
| `src/Components/Notes/hashState.js` | URL state: `#i:` prefix for notes, `#ic:` for comments |
| `src/Components/Markers/` | 3D placemark markers on the model |
| `src/store/NotesSlice.js` | Zustand: notes[], editBodies, editModes, selectedNoteId |
| `src/net/github/Issues.js` | GitHub API: `getIssues()`, create/update/delete |
| `src/Infrastructure/PlaceMark.js` | 3D marker placement on model surface |

## Behavior
- Notes fetched from GitHub Issues API for the current repository
- Each note can have a 3D placemark (marker position encoded in issue body)
- Markers rendered as colored spheres on the model surface
- Active marker: highlighted color; inactive: muted color
- Camera position stored with each note for exact view restoration
- Comments on issues supported as sub-notes
- Edit state tracked per-note (editBodies, editModes maps)
- Deleted notes prune associated edit state

## State Shape
```javascript
{
  notes: [],                // Array of GitHub issues
  selectedNoteId: null,     // Currently selected note
  selectedCommentId: null,  // Currently selected comment
  isNotesVisible: boolean,
  isCreateNoteVisible: boolean,
  editBodies: {},           // noteId → draft body text
  editModes: {},            // noteId → boolean
  editOriginalBodies: {},   // noteId → original text before edit
  markers: {},              // placemark data
}
```

## GitHub Integration
- Requires `accessToken` for authenticated operations
- Issues fetched per `repository` + `model` context
- Placemark coordinates embedded in issue body as structured data

## Known Issues
- Multiple useEffect hooks with suppressed exhaustive-deps warnings
- Missing dependencies: `accessToken`, `setNotes`, `toggleSynchSidebar`
- `.reverse().flatMap()` with side effects in note processing
