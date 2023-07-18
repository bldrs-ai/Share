import {isNumeric} from './strings'


/** @type {Object<string, Function>} */
const hashListeners = {}
window.onhashchange = () => {
  Object.values(hashListeners).forEach((listener) => {
    listener()
  })
}


// TODO(pablo): Ideally this would be handled by react-router
// location, but doesn't seem to be supported yet in v6.
// See also https://stackoverflow.com/a/71210781/3630172
/**
 * @param {string} name Name of listener.  Can be used to later remove
 * listener. TODO: add remove method
 * @param {Function} onHashCb Called when window.location.hash changes
 */
export function addHashListener(name, onHashCb) {
  hashListeners[name] = onHashCb
}


/**
 * Serialize the given paramObj and add it to the current
 * location.hash
 *
 * @param {Location} location The window.location object
 * @param {string} name A unique name for the params
 * @param {Object<string, any>} params The parameters to encode
 * @param {boolean} includeNames Whether or not to include the
 *   parameter names in the encoding, default is false.
 */
export function addHashParams(location, name, params, includeNames = false) {
  const hashGlobalParams = getHashParams(location, name)
  let objectGlobalParams = {}
  if (hashGlobalParams) {
    objectGlobalParams = getObjectParams(hashGlobalParams)
  }

  for (const paramName in params) {
    if (!Object.prototype.hasOwnProperty.call(params, paramName)) {
      continue
    }
    // @ts-ignore
    objectGlobalParams[paramName] = params[paramName]
  }

  const encodedParams = getEncodedParam(objectGlobalParams, includeNames)
  const sets = location.hash.substring(1).split('::')
  /** @type {Object<string, string>} */
  const setMap = {}

  for (let i = 0; i < sets.length; i++) {
    const set = sets[i]
    if (set === '') {
      continue
    }
    const setParts = set.split(':')
    const setName = setParts[0]
    const setValue = setParts[1]
    setMap[setName] = setValue
  }

  setMap[name] = encodedParams
  let newHash = ''

  for (const setKey in setMap) {
    if (Object.prototype.hasOwnProperty.call(setMap, setKey)) {
      const setValue = setMap[setKey]
      newHash += `${newHash.length === 0 ? '' : '::'}${setKey}:${setValue}`
    }
  }

  location.hash = newHash
}


/**
 * @param {object} objectParams
 * @return {string}
 */
export function getEncodedParam(objectParams, includeNames = false) {
  const objectKeys = Object.keys(objectParams)
  /**
   * @type {string[]}
   */
  const encodedParams = []

  objectKeys.forEach((objectKey) => {
    if (includeNames) {
      // @ts-ignore
      const objectValue = objectParams[objectKey]
      encodedParams.push(objectValue ? `${objectKey}=${objectValue}` : objectKey)
    } else {
      // @ts-ignore
      encodedParams.push(`${objectParams[objectKey]}`)
    }
  })

  const encodedParam = encodedParams.join(',')
  return encodedParam
}


/**
 * @param {string} hashParams
 * @return {object}
 */
export function getObjectParams(hashParams) {
  if (!hashParams) {
    return {}
  }
  const parts = hashParams.split(':')
  if (!parts[0] || !parts[1]) {
    return {}
  }
  const params = parts[1].split(',')
  const objectGlobalParams = {}

  params.forEach((param, index) => {
    if (!param) {
      return
    }
    const paramParts = param.split('=')
    // eslint-disable-next-line no-magic-numbers
    if (paramParts.length < 2) {
      if (isNumeric(paramParts[0])) {
        // @ts-ignore
        objectGlobalParams[index] = paramParts[0]
      } else {
        // @ts-ignore
        objectGlobalParams[paramParts[0]] = 0
      }
    } else {
      // @ts-ignore
      objectGlobalParams[paramParts[0]] = paramParts[1]
    }
  })

  return objectGlobalParams
}


/**
 * @param {Location} location
 * @param {string} name prefix of the params to fetch
 * @return {string|undefined} The encoded params (e.g. p:x=0,y=0)
 */
export function getHashParams(location, name) {
  return getHashParamsFromHashStr(location.hash.substring(1), name)
}


/**
 * @param {string} url
 * @param {string} name prefix of the params to fetch
 * @return {string|undefined} The encoded params (e.g. p:x=0,y=0)
 */
export function getHashParamsFromUrl(url, name) {
  const splitUrl = url.split('#')
  if (!splitUrl[1]) {
    return undefined
  }
  return getHashParamsFromHashStr(splitUrl[1], name)
}


/**
 * @param {string} hashStr
 * @param {string} name prefix of the params to fetch
 * @return {string|undefined} The encoded params (e.g. p:x=0,y=0)
 */
export function getHashParamsFromHashStr(hashStr, name) {
  const sets = hashStr.split('::')
  const prefix = `${name}:`
  for (let i = 0; i < sets.length; i++) {
    const set = sets[i]
    if (set.startsWith(prefix)) {
      return set
    }
  }
  return undefined
}


/**
 * Removes the given named hash param
 *
 * @param {Location} location
 * @param {string} name prefix of the params to fetch
 * @param {Array<string>} paramKeys param keys to remove from hash params. if empty, then remove all params
 */
export function removeHashParams(location, name, paramKeys = []) {
  const sets = location.hash.substring(1).split('::')
  const prefix = `${name}:`
  let newParamsEncoded = ''

  for (let i = 0; i < sets.length; i++) {
    let set = sets[i]

    if (set.startsWith(prefix)) {
      if (!paramKeys.length) {
        continue
      }
      const objectSet = getObjectParams(set)
      paramKeys.forEach((paramKey) => {
        // @ts-ignore
        delete objectSet[paramKey]
      })
      /**
       * @type {string[]}
       */
      const subSets = []
      Object.entries(objectSet).forEach((entry) => {
        const [key, value] = entry
        subSets.push(value ? `${key}=${value}` : key)
      })
      set = `${prefix}${subSets.join(',')}`
    }

    const separator = newParamsEncoded.length === 0 ? '' : '::'
    newParamsEncoded += separator + set
  }

  location.hash = newParamsEncoded
  if (location.hash === '') {
    history.pushState(
        '', document.title, window.location.pathname + window.location.search)
  }
}


/**
 * Removes the given named hash param.
 *
 * @param {string} org
 * @param {string} repo
 * @param {string} branchName
 * @param {string} filePath
 * @return {string} path to the model
 */
export function navigateBaseOnModelPath(org, repo, branchName, filePath) {
  return `/share/v/gh/${org}/${repo}/${branchName}${filePath}`
}


/**
 * @param {string} url
 * @return {string|undefined}
 */
export function getAllHashParams(url) {
  const splitHref = url ? url.split('#') : window.location.href.split('#')
  const allHashParams = splitHref[1]
  return allHashParams
}
