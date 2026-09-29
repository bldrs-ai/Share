/*
 * Guards that every Netlify Function loads under real Node ESM.
 *
 * `netlify/package.json` declares `"type": "module"`, so Node — and
 * Netlify's bundler, which fails the whole deploy with "is a CommonJS
 * module, but the closest 'package.json' declares type: module" — treats
 * each `.js` here as ESM. `record-load.js` alone was written with
 * `require` / `exports.handler`, and nothing local noticed: babel-jest
 * transforms both syntaxes, so the per-function Jest suites pass either way.
 * Only a real `import()` in a child Node process reproduces the failure.
 *
 * Runs under `yarn test-src` (jest roots include `netlify/`). A child process
 * rather than an in-process import so Jest's own transform can't paper over
 * a CommonJS file.
 */

import {execFileSync} from 'child_process'
import {readdirSync} from 'fs'
import path from 'path'


const FUNCTIONS_DIR = path.resolve(__dirname, '..')
const LOAD_TIMEOUT_MS = 60000

// Top-level `.js` files only: Netlify bundles those as functions, while
// `_lib/`, `_tests/` and `_pro-modules/` are subdirectories.
const functionFiles = readdirSync(FUNCTIONS_DIR).filter((f) => f.endsWith('.js'))

// Module-scope clients that throw at import without their credentials.
// The dummies only need to satisfy construction; nothing is called.
const DUMMY_ENV = {
  STRIPE_SECRET_KEY: 'sk_test_dummy',
  NODE_ENV: 'test',
}


describe('netlify functions load as ESM', () => {
  it('finds the functions', () => {
    expect(functionFiles).toContain('record-load.js')
  })

  it.each(functionFiles)('%s imports under Node ESM and exports a handler', (file) => {
    const url = `file://${path.join(FUNCTIONS_DIR, file)}`
    const script =
      `import(${JSON.stringify(url)}).then((m) => {` +
      `const h = m.handler || m.default;` +
      `if (typeof h !== 'function') { throw new Error('no handler export') }` +
      `process.exit(0) })`
    // execFileSync throws on non-zero exit, surfacing stderr (the
    // "require is not defined in ES module scope" text) in the failure.
    execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      env: {...process.env, ...DUMMY_ENV},
      stdio: 'pipe',
      timeout: LOAD_TIMEOUT_MS,
    })
  }, LOAD_TIMEOUT_MS)
})
