import dev from './vars.dev.js'
import cypress from './vars.cypress.js'
import prod from './vars.prod.js'


/**
 * We configure our esbuild from a combination of file-based defines, imported
 * here, and process.env overrides for CLI ergonomics.
 */


/**
 * This brings in overrides from process.env for the config vars we have already
 * defined.
 *
 * Exported for testing only.
 *
 * @return {{[key: string]: string}}
 */
export function zipEnvWithConfig(config) {
  const defines = {}
  Object.keys(config).forEach((name) => {
    let val = parse(process.env[name])
    if (val === undefined) {
      val = config[name]
      if (val === undefined) {
        val = null
      }
    }
    defines[`process.env.${name}`] = str(val)
  })
  return defines
}


/**
 * Convert simple env var strings to js types
 *
 * Exported for testing only.
 *
 * @return {boolean|number|string}
 */
export function parse(envStr) {
  if (envStr === undefined || envStr === 'undefined') {
    return undefined
  } else if (envStr === null || envStr === 'null') {
    return null
  } else if (envStr.toLowerCase() === 'false') {
    return false
  } else if (envStr.toLowerCase() === 'true') {
    return true
  } else if (isFinite(parseInt(envStr)) && envStr === Number(parseInt(envStr))) {
    return parseInt(envStr)
  } else if (isFinite(parseFloat(envStr))) {
    return parseFloat(envStr)
  }
  return envStr
}


// esbuild defines require string values. JSON.stringify includes
// quotes, e.g. '"true"', but esbuild seems ok with that.
const str = JSON.stringify

let config
switch (process.env.SHARE_CONFIG) {
  case 'dev': config = dev; break
  case 'cypress': config = cypress; break
  case 'prod': // fallthru
  default: config = prod; break
}

// What we're here for
export default zipEnvWithConfig(config)

// TODO(pablo): kill this
export const isWebIfcShimEnabled = true
