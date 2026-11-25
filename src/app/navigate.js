import {HASH_PREFIX_CAMERA} from '../Components/Camera/hashState'
import {isLocalOnlyPath} from '../routes/localOnly'
import {disablePageReloadApprovalCheck} from '../utils/event'
import {isSpaModelNavOn} from '../utils/spaModelNavMode'


/**
 * Navigate to index.ifc with nice camera setting.
 *
 * @param {Function} navigate
 * @param {string} appPrefix
 */
export function navToDefault(navigate, appPrefix) {
  // TODO: probe for index.ifc
  //
  // The camera below is tied to where the model lands in world space, and
  // that moved with conway 1.502+: `COORDINATE_TO_ORIGIN` used to anchor a
  // model on whichever element its file declared first, and now leaves
  // near-origin models on their authored coordinates (conway#87). index.ifc
  // shifted by exactly (+76, 0, +11.4504) — x ∈ [-76, 10] became x ∈ [0, 86]
  // — so this hash was shifted by the same amount. Re-capture it rather than
  // hand-edit it if the model or the frame changes again.
  disablePageReloadApprovalCheck()
  // Desktop and mobile deliberately share one framing. This was a ternary on
  // window.innerWidth whose two branches held byte-identical strings from the
  // file's first commit, so every camera re-capture had to hand-edit both
  // copies in lockstep (318af25) with nothing to catch it if only one changed.
  // Reintroduce the branch if the two framings ever genuinely diverge.
  const cameraHash = `#${HASH_PREFIX_CAMERA}:-57.022,131.828,173.3,37.922,22.64,9.136`
  // `window.location`, spelled out: this is the global, not the router's
  // location. That distinction is what broke #1784 one level down.
  navWith(navigate, `${appPrefix}/v/p/index.ifc`, {
    search: window.location.search,
    hash: cameraHash,
  })
}


/**
 * True when `pathname` addresses a temporary (uploaded) model. These live
 * under the `/v/local-only/<uuid>` route (legacy `/v/new/<uuid>`) and are
 * stored only in OPFS — there is no remote source to reload them from, so
 * clearing the cache leaves the URL pointing at a model that no longer
 * exists.
 *
 * @param {string} pathname e.g. window.location.pathname
 * @return {boolean}
 */
export function isTempModelPath(pathname) {
  return typeof pathname === 'string' && isLocalOnlyPath(pathname)
}


/**
 * Full path to the home model (`index.ifc`) with the default camera, as a
 * plain string suitable for a hard `window.location.assign`. Mirrors the
 * destination `navToDefault` computes for SPA navigation, including
 * carrying the current query string forward — feature flags live there
 * (`?feature=…`, read from `window.location.search` at runtime) and would
 * otherwise be dropped by the cache-clear redirect.
 *
 * @param {?string} [appPrefix] e.g. '/share'; derived from the current
 *   install prefix when omitted (matches BaseRoutes' computation).
 * @return {string}
 */
export function homeModelPath(appPrefix) {
  const prefix = appPrefix ||
    `${window.location.pathname.startsWith('/Share') ? '/Share' : ''}/share`
  const search = window.location.search || ''
  const cameraHash = `#${HASH_PREFIX_CAMERA}:-57.022,131.828,173.3,37.922,22.64,9.136`
  return `${prefix}/v/p/index.ifc${search}${cameraHash}`
}


/**
 * Refresh the page after a Clear-Local-Cache reset. A normal model reloads
 * from its remote source, so a plain page reload is enough. But a temporary
 * (uploaded) model exists only in the OPFS cache we just cleared — reloading
 * its `/v/local-only/<uuid>` URL would parse as a local model that is no longer
 * present, and the loader would raise a "file not found" error dialog (with
 * a Reset button). Detect that case and navigate to the home model instead,
 * so the user gets a fresh session with no error — exactly what hitting
 * Reset would have produced.
 *
 * @param {?string} [appPrefix] e.g. '/share'
 */
export function reloadAfterCacheClear(appPrefix) {
  if (isTempModelPath(window.location.pathname)) {
    disablePageReloadApprovalCheck()
    window.location.assign(homeModelPath(appPrefix))
    return
  }
  window.location.reload()
}


/**
 * Helper for calling navigate that will append search query to path,
 * if present, before appending an optional hash.
 *
 * Either search or hash may be passed as null|undefined, but if they
 * are present must either be the empty string or start with their
 * standard delimeter.
 *
 * @param {Function} navigate
 * @param {string} path
 * @param {object} options
 */
export function navWith(navigate, path, options = {
  search: location.search,
  hash: location.hash,
}) {
  const search = options.search || ''
  if (search !== '' && !search.startsWith('?')) {
    throw new Error(`Given search must start with ? Got: ${search}`)
  }
  const hash = options.hash || ''
  if (hash !== '' && !hash.startsWith('#')) {
    throw new Error(`Given hash must start with # Got: ${hash}`)
  }
  navigate(`${path}${search}${hash}`)
}


/**
 * Merge the current query string into `path` when it carries none of its
 * own, inserting it before any hash. Opening a model is a full page load
 * by default (see `navigateToModel`), and most call sites build their
 * destination from path segments alone (`${appPrefix}/v/local-only/${filename}`),
 * so without this the reload drops `?feature=…` and the user falls out of
 * whatever flags they were running — same reason `homeModelPath` carries the
 * query forward across the cache-clear redirect. An in-app open needs it as
 * much: `isFeatureEnabled` reads the flags from the URL it lands on.
 *
 * @param {string} path Destination, may contain its own search and/or hash
 * @return {string}
 */
function withCurrentSearch(path) {
  const currentSearch = (typeof window !== 'undefined' && window.location && window.location.search) || ''
  if (currentSearch === '' || path.includes('?')) {
    return path
  }
  const hashAt = path.indexOf('#')
  if (hashAt === -1) {
    return `${path}${currentSearch}`
  }
  return `${path.slice(0, hashAt)}${currentSearch}${path.slice(hashAt)}`
}


/**
 * Navigate to a model path. An in-app react-router transition by default
 * (open-205 #2011, on since step F), which keeps the page and leaves freeing
 * the previous model to the viewer's teardown and CadView's load ownership
 * (design/new/in-app-model-switch.md §2, §4.5a, §6). With the kill switch
 * or the rollback on (`utils/spaModelNavMode.js`), the full page load it
 * always was, which frees the previous model's memory with the page. During unit tests, falls back
 * to SPA navigate to avoid jsdom reloads. The current query string is
 * carried forward when the target doesn't specify its own (see
 * `withCurrentSearch`), either way.
 *
 * @param {string|object} target Destination path or location-like object
 * @param {Function} [navigate] react-router navigate: required for the
 *   in-app path. Every caller passes one; a call without one still loads
 *   the page, flag or not, rather than not navigating at all.
 */
export function navigateToModel(target, navigate) {
  // Avoid blocking reload prompts
  try {
    disablePageReloadApprovalCheck()
  } catch (e) {/* ignore */}

  let path
  if (typeof target === 'string') {
    path = target
  } else if (target && typeof target === 'object') {
    const search = target.search || ''
    const hash = target.hash || ''
    path = `${target.pathname || ''}${search}${hash}`
  } else {
    throw new Error('navigateToModel: invalid target')
  }

  path = withCurrentSearch(path)

  // In tests, prefer SPA navigate to keep assertions stable
  if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test') {
    if (typeof navigate === 'function') {
      navigate(path)
      return
    }
  }

  // Read at call time, like every `isFeatureEnabled` check: a kill switch
  // (`?feature=disableSpaModelNav`) rides in the query string
  // `withCurrentSearch` just carried forward, so the page it loads keeps it.
  // A link that names the kill switch in its own query loads the page too:
  // the destination's readers (CadView, ShareIfc) take the mode from ITS
  // URL, so an in-app open there would run as the kill switch's page-load
  // path (no abort, no store reset) without the page load (codex on #2222).
  if (typeof navigate === 'function' && isSpaModelNavOn() && !namesKillSwitch(path)) {
    navigate(path)
    return
  }

  // Force a full reload in normal runtime
  if (path && typeof window !== 'undefined' && window.location) {
    // Using assign to preserve back button history
    window.location.assign(path)
  }
}


/**
 * Whether `path`'s own query turns the in-app switch off
 * (`?feature=disableSpaModelNav`, utils/spaModelNavMode.js). A path with no
 * query of its own has the page's by now (`withCurrentSearch`), and a page
 * with the kill switch already loads every open.
 *
 * @param {string} path
 * @return {boolean}
 */
function namesKillSwitch(path) {
  const search = searchOf(path)
  if (search === null) {
    return false
  }
  const features = (new URLSearchParams(search).get('feature') ?? '').split(',')
  return features.some((name) => name.trim().toLowerCase() === 'disablespamodelnav')
}


/**
 * @param {string} path a path, maybe with its own `?query` and `#hash`
 * @return {string|null} its `?query`, or null when it has none
 */
function searchOf(path) {
  const queryAt = path.indexOf('?')
  if (queryAt === -1) {
    return null
  }
  const hashAt = path.indexOf('#', queryAt)
  return path.slice(queryAt, hashAt === -1 ? undefined : hashAt)
}


/**
 * Navigate to a local file held in memory (`loader/inMemoryUploads.js`), in
 * a browser without OPFS (#1906). Unlike a default `navigateToModel` this is
 * always an in-app (react-router) transition, never a page load, flag or
 * not: the `File` lives only in this page's memory, so a page load would end
 * it before the Loader could read it. Otherwise it is `navigateToModel`'s
 * in-app path: the current query string is carried forward, and the
 * upload guard is disarmed, as every other open does before it leaves a
 * model (#2021). The guard then belongs to the model being opened:
 * Loader#load arms it again for this upload.
 *
 * @param {string} path `${appPrefix}/v/local-only/<uuid>.<ext>`
 * @param {Function} navigate react-router navigate
 */
export function navigateToInMemoryModel(path, navigate) {
  try {
    disablePageReloadApprovalCheck()
  } catch (e) {/* ignore */}
  navigate(withCurrentSearch(path))
}


/**
 * Helper for calling navigate that will remove a named parameter from search.
 *
 * @param {Function} navigate
 * @param {string} path
 * @param {string} paramName
 */
export function navWithSearchParamRemoved(navigate, path, paramName) {
  if (typeof(paramName) !== 'string' || paramName.length < 1) {
    throw new Error(`Must provide a non-empty string param name.  Got "${paramName}"`)
  }
  const sp = new URLSearchParams(location.search)
  sp.delete(paramName)
  navWith(navigate, path, {
    search: `?${sp.toString()}`,
    hash: location.hash,
  })
}
