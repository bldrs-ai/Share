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
 *
 * What this does NOT prove: that the function loads once deployed. It
 * imports the source in place, so every dependency resolves against the
 * repo's full `node_modules`; what Netlify ships is a bundle holding only the
 * files its bundler chose, and a file missing from that bundle 502s on cold
 * start while passing here (#1837). tools/netlify/functionBundler.test.js
 * covers that by bundling each function as a deploy does and loading the
 * bundle outside the repo.
 */

import {execFileSync} from 'child_process'
import {readdirSync} from 'fs'
import path from 'path'
import {pathToFileURL} from 'url'


const FUNCTIONS_DIR = path.resolve(__dirname, '..')
const LOAD_TIMEOUT_MS = 60000

// Every top-level file is a function to Netlify, whatever its extension;
// `_lib/`, `_tests/` and `_pro-modules/` are subdirectories.
const functionFiles = readdirSync(FUNCTIONS_DIR, {withFileTypes: true})
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)

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

  // `netlify/package.json`'s `"type": "module"` is what makes a `.js` file
  // ESM, and it's the premise of this suite. A `.cjs` (CommonJS whatever
  // the package says), `.mjs` or `.ts` function would need its own loading
  // rule here — fail loudly rather than skip it.
  it('has only .js functions', () => {
    expect(functionFiles.filter((f) => path.extname(f) !== '.js')).toEqual([])
  })

  it.each(functionFiles.filter((f) => path.extname(f) === '.js'))('%s imports under Node ESM and exports a handler', (file) => {
    const url = pathToFileURL(path.join(FUNCTIONS_DIR, file)).href
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
