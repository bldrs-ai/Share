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
