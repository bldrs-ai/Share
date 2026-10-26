/**
 * The local-only model route: a file opened from the user's computer, at
 * `<appPrefix>/v/local-only/<uuid>.<ext>` (#1959).
 *
 * Its bytes live only in this browser — in OPFS, or without OPFS in the
 * memory of the page that opened it (`loader/inMemoryUploads.js`) — so the
 * URL opens nowhere else. It used to be `/v/new/<uuid>.<ext>`, which read
 * like a universal share link and got copied into chats (#1955, about half
 * of the "Folder <id> not found" errors). The id stays in the URL because
 * reload, local recents, #1956's "not in this browser" alert and #1906's
 * in-memory fallback all key on it.
 *
 * `/v/new/` still resolves: ShareRoutes redirects it here with replaceState,
 * so old recents, bookmarks and copied links keep working. Every provenance
 * test goes through `isLocalOnlyPath`, which accepts both forms.
 *
 * Prefix-independent on purpose. Share is served at `/share/…` on bldrs.ai
 * and at `/Share/share/…` on a GitHub Pages install (BaseRoutes'
 * `installPrefix`), and the old `startsWith('/share/v/new')` tests missed the
 * second (codex on #1956, #1957, #1958). The route kind is the path segment
 * after the FIRST `/v/`: an app prefix never contains `/v/`, and a later
 * `/v/new/` inside a GitHub file path (`/share/v/gh/o/r/main/v/new/x.ifc`) is
 * not the route.
 */
export const LOCAL_ONLY_ROUTE = 'local-only'

/** The route's pre-#1959 name, kept only to redirect from. */
export const LEGACY_UPLOAD_ROUTE = 'new'

const ROUTE_KIND = /\/v\/([^/?#]+)/


/**
 * @param pathname e.g. `/Share/share/v/gh/o/r/main/x.ifc`
 * @return The view route's kind, e.g. 'gh', 'p', 'local-only', or null when
 *   the path has no `/v/<kind>` segment.
 */
export function viewRouteKind(pathname: string): string | null {
  if (typeof pathname !== 'string') {
    return null
  }
  const match = ROUTE_KIND.exec(pathname)
  return match ? match[1] : null
}


/**
 * @param pathOrUrl A pathname, a path with search/hash, or a URL
 * @return Whether it addresses a local-only model, under either route name
 *   and whatever the install prefix.
 */
export function isLocalOnlyPath(pathOrUrl: string | URL | null | undefined): boolean {
  const kind = viewRouteKind(pathnameOf(pathOrUrl))
  return kind === LOCAL_ONLY_ROUTE || kind === LEGACY_UPLOAD_ROUTE
}


/**
 * @param pathname
 * @return Whether it is the legacy `/v/new/` form that should redirect.
 */
export function isLegacyUploadPath(pathname: string): boolean {
  return viewRouteKind(pathname) === LEGACY_UPLOAD_ROUTE
}


/**
 * @param appPrefix e.g. '/share' or '/Share/share'
 * @param storageId `<uuid>.<ext>`, the OPFS storage id or in-memory id
 * @return `<appPrefix>/v/local-only/<storageId>`
 */
export function localOnlyPath(appPrefix: string, storageId: string): string {
  return `${appPrefix}/v/${LOCAL_ONLY_ROUTE}/${storageId}`
}


/**
 * Rewrite a legacy `/v/new/…` path to its `/v/local-only/…` form, leaving
 * everything else (prefix, id, element path, search, hash) as it was. Any
 * other path comes back unchanged.
 *
 * @param path
 * @return The canonical path
 */
export function toLocalOnlyPath(path: string): string {
  if (!isLegacyUploadPath(path)) {
    return path
  }
  return path.replace(`/v/${LEGACY_UPLOAD_ROUTE}`, `/v/${LOCAL_ONLY_ROUTE}`)
}


/**
 * @param pathOrUrl
 * @return Its pathname; '' for anything unparseable
 */
function pathnameOf(pathOrUrl: string | URL | null | undefined): string {
  if (pathOrUrl === undefined || pathOrUrl === null) {
    return ''
  }
  try {
    return new URL(String(pathOrUrl), 'http://localhost').pathname
  } catch (_) {
    return ''
  }
}
