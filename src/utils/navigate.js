import {disablePageReloadApprovalCheck} from './event'
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
 * @param {string|{pathname:string, search?:string, hash?:string}} target Destination path or location-like object
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
