# Spec: Search

## Overview
Dual-purpose search bar: searches for elements within the loaded IFC model AND accepts GitHub/file URLs to open new models.

## Key Files
| File | Role |
|------|------|
| `src/Components/Search/SearchBar.jsx` | Autocomplete input: search queries + URL input |
| `src/search/SearchIndex.js` | Element indexing for in-model search |
| `src/store/SearchSlice.js` | Zustand: search state |

## Behavior
### Model Search
- Searches indexed IFC element names, types, and properties
- Autocomplete suggestions as user types
- Selecting a result selects the element in the 3D view
- Search query persisted in URL search params (`?q=...`)

### URL Input
- Detects GitHub URLs via `looksLikeLink()`
- Converts GitHub URLs to share paths via `githubUrlOrPathToSharePath()`
- Navigates to new model on enter
- Supports external URLs via `processExternalUrl()`

## State
```javascript
{
  searchIndex: null | SearchIndex,
  isSearchBarVisible: boolean
}
```
