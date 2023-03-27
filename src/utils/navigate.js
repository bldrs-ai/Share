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
  search: '',
  hash: '',
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
 * Helper for calling navigate that will append location.search to the
 * given path, if present.
 *
 * @param {Function} navigate
 * @param {string} path
 */
export function navWithSearchState(navigate, path) {
  navWith(navigate, path, {
    search: location.search,
  })
}


/**
 * Helper for calling navigate that will append location.hash to the
 * given path, if present.
 *
 * @param {Function} navigate
 * @param {string} path
 */
export function navWithHashState(navigate, path) {
  navWith(navigate, path, {
    hash: location.hash,
  })
}


/**
 * Helper for calling navigate that will append location.search and
 * location.hash to the given path, if present.
 *
 * @param {Function} navigate
 * @param {string} path
 */
export function navWithSearchAndHashState(navigate, path) {
  navWith(navigate, path, {
    search: location.search,
    hash: location.hash,
  })
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
