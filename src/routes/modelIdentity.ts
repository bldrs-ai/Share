/**
 * A stable identity for the model a route loads, for state that belongs to
 * one model (e.g. the store's hidden elements, which `CadView#onViewer`
 * claims per model).
 *
 * Every `RouteResult` carries `downloadUrl`: GitHub, Google Drive (built from
 * the file id), generic `/u` URLs and local or uploaded files alike. It is set
 * once when the route is parsed and never rewritten by the load, so a viewer
 * re-init of the same route yields the same identity. `srcUrl`, `gitpath` and
 * `filepath` are fallbacks for bare `{filepath}` model paths, which carry no
 * `downloadUrl`.
 *
 * @param modelPath the route result being loaded
 * @param installPrefix prefix for a bare `filepath`
 * @return identity string
 */
export default function modelIdentity(
  modelPath: {downloadUrl?: URL | string, srcUrl?: string, gitpath?: string, filepath?: string},
  installPrefix = '',
): string {
  if (modelPath.downloadUrl) {
    return String(modelPath.downloadUrl)
  }
  return modelPath.srcUrl || modelPath.gitpath || `${installPrefix}${modelPath.filepath}`
}
