/**
 * Model display naming, shared by every surface that shows a model by
 * name: the page title (Share.jsx), Open > Recents
 * (RecentFilesList.jsx) and the workspace ProjectsDrawer.
 *
 * These had drifted apart — the drawer derived its own label from the URL
 * and so listed local uploads as raw OPFS storage ids
 * (`/v/new/<blob-uuid>.ifc`), while Recents already knew the real
 * filename. One module so a naming fix lands everywhere at once.
 */


import {loadAllRecentFiles} from '../connections/persistence'


/**
 * Display name for a recents entry. `modelTitle` is the name extracted
 * from the model itself (back-filled after load, see Share.jsx);
 * `name` is the filename the user picked. A local upload's `id` is the
 * OPFS storage id and is deliberately never shown.
 *
 * @param {object} [entry] RecentFileEntry
 * @return {string|undefined} Display name, undefined when unknown.
 */
export function recentDisplayName(entry) {
  return entry?.modelTitle || entry?.name || undefined
}


/**
 * The recents entry for a model route, if we have one. A local upload
 * routes by its OPFS storage id (`/v/new/<blob-uuid>.ifc`), so the path
 * segment alone would display as a UUID; recents holds the id -> name
 * mapping (see #1682).
 *
 * @param {string} pathname
 * @return {object|undefined} RecentFileEntry
 */
export function recentEntryForPath(pathname) {
  const segment = decodeURIComponent(pathname.split('/').filter(Boolean).pop())
  try {
    return loadAllRecentFiles().find((f) => f.sharePath === pathname || f.id === segment)
  } catch {
    return undefined
  }
}


/**
 * Label for a model route: the model's own name where known, else the
 * path segment.
 *
 * @param {string} pathname
 * @return {string}
 */
export function labelForModelPath(pathname) {
  return recentDisplayName(recentEntryForPath(pathname)) ||
    decodeURIComponent(pathname.split('/').filter(Boolean).pop())
}


/**
 * The browser page title for a loaded model.
 *
 * @param {object} modelPath The model path from routes
 * @param {string|undefined} modelName Name extracted by the loader onto store.model
 * @param {boolean} [isUploadedFile] Whether the model is an uploaded file
 * @return {string}
 */
export function pageTitleForModel(modelPath, modelName, isUploadedFile) {
  const modelPathFilename = modelPath.filepath?.split('/').pop()
  switch (modelPath.kind) {
    case 'file':
      return isUploadedFile ? `New: ${modelName}` : `${modelName || modelPathFilename}`
    case 'provider':
      switch (modelPath.provider) {
        case 'google':
          return `Google: ${modelName || 'file'}`
        case 'github':
          return `GitHub: ${modelName === undefined ?
            `${modelPath.repo}/${modelPath.filepath} at ${modelPath.branch}` :
            modelName}`
        default:
          return `${modelPath.provider}: ${modelName || modelPathFilename}`
      }
    case 'srcUrl':
      return modelName || modelPathFilename
    default:
      return 'Loading...'
  }
}
