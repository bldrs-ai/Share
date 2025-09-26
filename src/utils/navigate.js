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
