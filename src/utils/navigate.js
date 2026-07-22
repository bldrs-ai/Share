import {HASH_PREFIX_CAMERA} from '../Components/Camera/hashState'
import {disablePageReloadApprovalCheck} from './event'


/**
 * Navigate to index.ifc with nice camera setting.
 *
 * @param {Function} navigate
 * @param {string} appPrefix
 */
export function navToDefault(navigate, appPrefix) {
  // TODO: probe for index.ifc
  const mediaSizeTabletWith = 900
  disablePageReloadApprovalCheck()
  const defaultPath = `${appPrefix}/v/p/index.ifc${location.query || ''}`
  const cameraHash = window.innerWidth > mediaSizeTabletWith ?
    `#${HASH_PREFIX_CAMERA}:-133.022,131.828,161.85,-38.078,22.64,-2.314` :
    `#${HASH_PREFIX_CAMERA}:-133.022,131.828,161.85,-38.078,22.64,-2.314`
  navWith(navigate, defaultPath, {
    search: location.search,
    hash: cameraHash,
  })
}


/**
 * True when `pathname` addresses a temporary (uploaded) model. These live
 * under the `/v/new/<uuid>` route and are stored only in OPFS — there is
 * no remote source to reload them from, so clearing the cache leaves the
 * URL pointing at a model that no longer exists.
 *
 * @param {string} pathname e.g. window.location.pathname
 * @return {boolean}
 */
export function isTempModelPath(pathname) {
  return typeof pathname === 'string' && pathname.includes('/v/new/')
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
  const cameraHash = `#${HASH_PREFIX_CAMERA}:-133.022,131.828,161.85,-38.078,22.64,-2.314`
  return `${prefix}/v/p/index.ifc${search}${cameraHash}`
}


/**
 * Refresh the page after a Clear-Local-Cache reset. A normal model reloads
 * from its remote source, so a plain page reload is enough. But a temporary
 * (uploaded) model exists only in the OPFS cache we just cleared — reloading
 * its `/v/new/<uuid>` URL would parse as a local model that is no longer
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
 * Navigate to a model path with a full page reload to free memory.
 * During unit tests, falls back to SPA navigate to avoid jsdom reloads.
 *
 * @param {string|object} target Destination path or location-like object
 * @param {Function} [navigate] Optional react-router navigate for test fallback
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

  // In tests, prefer SPA navigate to keep assertions stable
  if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test') {
    if (typeof navigate === 'function') {
      navigate(path)
      return
    }
  }

  // Force a full reload in normal runtime
  if (path && typeof window !== 'undefined' && window.location) {
    // Using assign to preserve back button history
    window.location.assign(path)
  }
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
