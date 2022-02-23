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
  // TODO(pablo): accomodate existing params
  location.hash = `${name}:${encodedParams}`
}
