import {readFileSync, existsSync} from 'fs'
import {resolve, dirname} from 'path'
import {fileURLToPath} from 'url'
import dev from './vars.dev.js'
import cypress from './vars.cypress.js'
import playwright from './vars.playwright.js'
import prod from './vars.prod.js'

// Auto-load .env file if present (so devs don't need to `source .env` manually)
const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '../../.env')
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf-8').split('\n')
  lines.forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const eq = trimmed.indexOf('=')
    if (eq > 0) {
      const key = trimmed.substring(0, eq).trim()
      let val = trimmed.substring(eq + 1).trim()
      // Strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      process.env[key] = val
    }
  })
  console.log('.env loaded:', envPath, `(${lines.length} lines)`)
} else {
  console.log('.env not found at:', envPath)
}


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
 * @param {object} config - Configuration object
 * @return {object}
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
 * @param {string} envStr - Environment variable string
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
  } else if (isFinite(parseFloat(envStr)) && String(parseFloat(envStr)) === envStr) {
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
  case 'playwright': config = playwright; break
  case 'prod': // fallthru
  default: config = prod; break
}

// What we're here for
export default zipEnvWithConfig(config)

// TODO(pablo): kill this
export const isWebIfcShimEnabled = true
