# Route Handling System

This directory contains the route handling logic for the Share application, which processes different types of file sources including local files, GitHub repositories, Google Drive files, and external URLs.

## Overview

The route handling system converts URL paths into structured route results that contain metadata needed to load and display files. It uses a demultiplexing pattern where a single entry point (`handleRoute`) dispatches to specialized handlers based on the path prefix.

## Architecture

### Entry Point: `routes.ts`

The main entry point is the `handleRoute` function in `routes.ts:28`:

```typescript
handleRoute(pathPrefix: string, routeParams: RouteParams): RouteResult | null
```

This function examines the `pathPrefix` to determine the route type and delegates to the appropriate handler.

### Route Types

The system supports five route types, defined by their path prefixes:

#### 1. **Local Project Files** (`/v/p`)
- **Pattern**: `/share/v/p/*`
- **Handler**: `processFile`
- **Use Case**: Hosted project files served from the application
- **Example**: `/share/v/p/model.ifc/123`
- **Result**: `FileResult` with filepath and optional element path

#### 2. **New/Uploaded Files** (`/v/new`)
- **Pattern**: `/share/v/new/*`
- **Handler**: `processFile`
- **Use Case**: Files uploaded via drag-and-drop or file picker
- **Example**: `/share/v/new/AA77535-D1B6-49A9-915B-41343B08BF83.ifc`
- **Result**: `FileResult` with `isUploadedFile: true`

#### 3. **GitHub Files** (`/v/gh`)
- **Pattern**: `/share/v/gh/:org/:repo/:branch/*`
- **Handler**: `processGithubParams` (`github.ts:13`)
- **Use Case**: Files from public GitHub repositories
- **Example**: `/share/v/gh/IFCjs/test-ifc-files/main/model.ifc`
- **Result**: `GithubResult` with org, repo, branch, and filepath

#### 4. **External URLs** (`/v/u`)
- **Pattern**: `/share/v/u/*`
- **Handler**: `processExternalUrl`
- **Use Case**: Generic external URLs (currently supports Google Drive URLs)
- **Example**: `/share/v/u/https://drive.google.com/file/d/[fileId]/view`
- **Result**: `GoogleResult` or `UrlResult`

#### 5. **Google Drive Shortcuts** (`/v/g`)
- **Pattern**: `/share/v/g/*`
- **Handler**: `processGoogleUrl` or `processGoogleFileId` (`google.ts`)
- **Use Case**: Direct Google Drive file IDs or URLs
- **Examples**:
  - `/share/v/g/1sWR7x4BZ-a8tIDZ0ICo0woR2KJ_rHCSO` (file ID)
  - `/share/v/g/https://drive.google.com/file/d/[fileId]/view` (URL)
- **Result**: `GoogleResult` with fileId and download URL

## Type System

### Input Types

- **`RouteParams`**: React Router parameters including the splat (`*`) parameter containing the embedded file path
- **`GithubParams`**: Extended parameters with `org`, `repo`, and `branch` fields

### Result Types

All results extend `BaseResult`:

```typescript
interface BaseResult {
  originalUrl: URL        // The original Share URL
  downloadUrl: URL        // Where to fetch the file
  mimeType?: string       // Optional MIME type
  title?: string          // Optional display title
}
```

Specialized result types:

- **`FileResult`**: Local files with `filepath` and optional `eltPath` (element path)
- **`UrlResult`**: Generic external URLs
- **`GithubResult`**: GitHub files with repository metadata
- **`GoogleResult`**: Google Drive files with `fileId`

## File Path Processing

All routes support element paths, which are path segments following the file extension:

```
/model.ifc/123/456
         └─┬──┘
      eltPath (element selection)
```

The `splitAroundExtensionRemoveFirstSlash` utility (from `../Filetype`) separates:
- The file path (up to and including the extension)
- The element path (everything after the extension)

## Provider-Specific Handlers

### GitHub (`github.ts`)

- Validates required parameters (`org`, `repo`, `branch`) using `isGithubParams`
- Constructs GitHub raw content URLs
- Provides `getRepoPath()` helper method
- Returns `GithubResult` with full repository context

### Google Drive (`google.ts`)

Supports multiple Google Drive URL formats:
- Standard sharing URLs: `drive.google.com/file/d/[fileId]/...`
- API URLs: `www.googleapis.com/drive/v3/files/[fileId]`
- Download URLs: `drive.google.com/uc?id=[fileId]`
- Direct file IDs (25-44 alphanumeric characters)

Features:
- File ID validation with regex patterns
- Optional resource key support for restricted files
- Automatic download URL generation using Google Drive API

## Integration

### React Router Setup

Routes are configured in `ShareRoutes.jsx`:

```jsx
<Route path='v/p/*' element={<Share pathPrefix={`${appPrefix}/v/p`}/>}/>
<Route path='v/new/*' element={<Share pathPrefix={`${appPrefix}/v/new`}/>}/>
<Route path='v/gh/:org/:repo/:branch/*' element={<Share pathPrefix={`${appPrefix}/v/gh`}/>}/>
<Route path='v/u/*' element={<Share pathPrefix={`${appPrefix}/v/u`}/>}/>
<Route path='v/g/*' element={<Share pathPrefix={`${appPrefix}/v/g`}/>}/>
```

### Usage in Share Component

The Share component (`Share.jsx:53`) calls `handleRoute` in a `useEffect`:

```javascript
const mp = handleRoute(pathPrefix, routeParams)
if (mp === null) {
  navToDefault(navigate, appPrefix)
  return
}
setModelPath(mp)
```

Model path changes trigger scene reloading in the CadView component.

## Testing

End to end tests in:
- `routes.spec.ts`: Integration tests for all route types wihtin the Share app.

Comprehensive test coverage in:
- `routes.test.ts`: Integration tests for all route types
- `github.test.ts`: GitHub-specific edge cases
- `google.test.ts`: Google Drive URL parsing and validation

Tests verify:
- Correct route result structure
- File path and element path extraction
- Provider-specific metadata extraction
- Edge cases (variant file extensions, complex paths, etc.)

## Error Handling

- Returns `null` for invalid or unrecognized routes
- File ID validation prevents malformed identifiers
- URL parsing errors are caught and handled gracefully
- The Share component redirects to default when route handling returns `null`

## Future Extensions

To add a new file source provider:

1. Create a new handler file (e.g., `newprovider.ts`)
2. Define provider-specific params and result types extending `ProviderResult`
3. Implement URL parsing and validation logic
4. Add a new path prefix case in `handleRoute`
5. Add route configuration in `ShareRoutes.jsx`
6. Write tests covering the new provider's URL formats
