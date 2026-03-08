/**
 * Allowlist of known sample model org/repo prefixes.
 * Extracted from src/Components/Open/SampleModels.jsx
 */
const SAMPLE_PREFIXES = [
  '/share/v/gh/Swiss-Property-AG/',
  '/share/v/gh/bldrs-ai/test-models/',
  '/share/v/gh/OlegMoshkovich/Bldrs_Plaza/',
]

/** Built-in project files are always exempt */
const EXEMPT_PREFIXES = ['/share/v/p/']


/**
 * Check whether a path is a sample model or exempt built-in file.
 *
 * @param {string} path URL path to check
 * @return {boolean} true if the path is exempt from rate limiting
 */
export function isSampleOrExemptPath(path) {
  if (!path || typeof path !== 'string') {
    return false
  }
  for (const prefix of SAMPLE_PREFIXES) {
    if (path.startsWith(prefix)) {
      return true
    }
  }
  for (const prefix of EXEMPT_PREFIXES) {
    if (path.startsWith(prefix)) {
      return true
    }
  }
  return false
}


export {SAMPLE_PREFIXES, EXEMPT_PREFIXES}
