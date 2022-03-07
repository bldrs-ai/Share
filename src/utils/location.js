
const hashListeners = {}
window.onhashchange = () => {
  for (const name in hashListeners) {
    if (Object.prototype.hasOwnProperty.call(hashListeners, name)) {
      const listener = hashListeners[name]
      listener()
    }
  }
}


// TODO(pablo): Ideally this would be hanled by react-router
// location, but doesn't seem to be supported yet in v6.
// See also https://stackoverflow.com/a/71210781/3630172
/**
 * @param {string} name Name of listener.  Can be used to later remove
 * listener. TODO: add remove method
 * @param {function} onHashCb Called when window.location.hash changes
 */
export function addHashListener(name, onHashCb) {
  hashListeners[name] = onHashCb
}


/**
 * Serialize the given paramObj and add it to the current
 * location.hash
 *
 * @param {Object} location The window.location object
 * @param {string} name A unique name for the params
 * @param {Object} params The parameters to encode
 * @param {boolean} includeNames Whether or not to include the
 *   parameter names in the encoding, default is false.
 */
export function addHashParams(location, name, params, includeNames = false) {
  let encodedParams = ''
  for (const paramName in params) {
    if (!Object.prototype.hasOwnProperty.call(params, paramName)) {
      continue
    }
    const paramValue = params[paramName]
    const separator = encodedParams == '' ? '' : ','
    const encodedParam = includeNames ? `${paramName}=${paramValue}` : paramValue
    encodedParams += `${separator}${encodedParam}`
  }
  const sets = location.hash.substring(1).split('::')
  const setMap = {}
  for (let i = 0; i < sets.length; i++) {
    const set = sets[i]
    if (set == '') {
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
      newHash += (newHash.length == 0 ? '' : '::') + `${setKey}:${setValue}`
    }
  }
  location.hash = newHash
}


/**
 * @param {Object} location
 * @param {String} name prefix of the params to fetch
 * @return {string|undfined} The encoded params
 */
export function getHashParams(location, name) {
  const sets = location.hash.substring(1).split('::')
  const prefix = name + ':'
  for (let i = 0; i < sets.length; i++) {
    const set = sets[i]
    if (set.startsWith(prefix)) {
      return set
    }
  }
  return undefined
}


/**
 * Removes the given named hash param.
 * @param {Object} location
 * @param {String} name prefix of the params to fetch
 */
export function removeHashParams(location, name) {
  const sets = location.hash.substring(1).split('::')
  const prefix = name + ':'
  let newParamsEncoded = ''
  for (let i = 0; i < sets.length; i++) {
    const set = sets[i]
    if (set.startsWith(prefix)) {
      continue
    }
    const separator = newParamsEncoded.length == 0 ? '' : '::'
    newParamsEncoded += separator + set
  }
  location.hash = newParamsEncoded
  if (location.hash == '') {
    history.pushState(
        '', document.title, window.location.pathname + window.location.search)
  }
}
