// The six layers of src/ and the import/no-restricted-paths zones that hold
// them (design/tracks/open-t200/layering.md §2, §5). .eslintrc.cjs spreads
// `layerOverrides()` into its overrides.
//
// A file may import its own layer, any layer below it, and npm packages. The
// UI (layer 6) is never listed: it is whatever is left, so a directory nobody
// thought of (`src/app/`, a new feature folder, a root `.jsx`) is banned from
// below by default.
//
// The allowlist (layerAllowlist.json) maps a file to the upward imports it
// may still make. Each pair is excepted for that file alone: a second file
// making the same import, or the same file importing something else from
// above, fails. It only shrinks: src/layerBoundary.test.js fails on an entry
// whose import has gone, and checkLayerAllowlist.mjs fails a PR that adds one.
const path = require('path')
const allowlist = require('./layerAllowlist.json')


// Low to high. A layer may import itself and anything listed before it.
const LAYERS = [
  ['base', ['utils', 'privacy', 'routes', 'net', 'OPFS', 'search', 'FeatureFlags.js', 'Filetype.js']],
  ['engine', ['engine']],
  ['model', ['model']],
  ['loader', ['loader']],
  ['session', ['session', 'workspace']],
  ['viewer', ['viewer']],
]

const DOC = 'design/tracks/open-t200/layering.md'

// Production files only. Tests may reach up for a harness (the store, a mock
// viewer); the fences still cover them through the first override.
const FILES = ['src/**/*.js', 'src/**/*.jsx', 'src/**/*.ts', 'src/**/*.tsx']
const EXCLUDED = ['src/export/pro/**', '**/*.test.*', '**/*.spec.*', '**/*.fixture.*',
  '**/__mocks__/**', 'src/tests/**']


/**
 * @param {string} srcRel a path under src/, e.g. 'loader/Loader.js'
 * @return {string|null} the name of its layer, or null for the UI
 */
function layerOf(srcRel) {
  const first = srcRel.split('/')[0]
  const found = LAYERS.find(([, dirs]) => dirs.includes(first))
  return found ? found[0] : null
}


/**
 * One zone per directory of every layer below the UI. Each bans all of
 * `./src` and excepts the layers at or below its own.
 *
 * @param {Array<string>} [extraExcept] more `./src`-relative paths to except
 *   (an allowlisted file's own upward imports)
 * @return {Array<object>} zones for import/no-restricted-paths
 */
function layerZones(extraExcept = []) {
  const zones = []
  LAYERS.forEach(([name, dirs], i) => {
    const allowed = LAYERS.slice(0, i + 1)
    const except = allowed.flatMap(([, ds]) => ds.map((d) => `./${d}`))
    const names = allowed.map(([n]) => n).join(', ')
    for (const dir of dirs) {
      zones.push({
        target: `./src/${dir}`,
        from: './src',
        except: [...except, ...extraExcept],
        message: `layering (${DOC}): ${name} may import only ${names}`,
      })
    }
  })
  return zones
}


/**
 * The overrides for .eslintrc.cjs: one for every production file, then one
 * per allowlisted file adding exactly its pairs to the excepts. An override
 * replaces a rule's options rather than merging them, so each repeats the
 * fences' zones.
 *
 * @param {Array<object>} fenceZones the pro-module and Assist fences
 * @return {Array<object>} eslint overrides
 */
function layerOverrides(fenceZones) {
  const rule = (extra) => ({'import/no-restricted-paths': ['error', {zones: [...fenceZones, ...layerZones(extra)]}]})
  const perFile = Object.entries(allowlist).map(([file, imports]) => ({
    files: [file],
    rules: rule(imports.map((imp) => `./${path.posix.relative('src', imp)}`)),
  }))
  return [{files: FILES, excludedFiles: EXCLUDED, rules: rule([])}, ...perFile]
}


module.exports = {LAYERS, DOC, layerOf, layerZones, layerOverrides}
