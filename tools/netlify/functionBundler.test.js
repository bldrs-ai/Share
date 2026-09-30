/*
 * Bundles every Netlify Function the way a deploy does, then loads each
 * bundle the way Lambda does — so a function that would 502 on cold start
 * fails here instead of on a deploy preview.
 *
 * Why this and not a source-level check: a function can import cleanly from
 * `netlify/functions/` (resolving against the repo's full `node_modules`) and
 * still crash in production, because what ships is zip-it-and-ship-it's
 * output, which contains only the files its bundler decided to include.
 * Under the default nft bundler an ESM function is transpiled to CommonJS,
 * `import axios` becomes `require('axios')`, Node resolves that to
 * `axios/dist/node/axios.cjs`, and nft never copied that file (#1837's
 * deploy-preview 502; the reasoning is in netlify.toml above `[functions]`).
 * `netlify/functions/_tests/esmLoad.test.js` cannot see that: it imports the
 * sources in place.
 *
 * How: tools/netlify/bundleFunctions.mjs resolves netlify.toml with
 * `@netlify/config` and bundles with zip-it-and-ship-it the way
 * `@netlify/build` does (details in its header). Each bundle is then loaded
 * in a child Node process whose cwd is the bundle, under the OS temp dir, so
 * module resolution can't fall back to the repo's `node_modules`. `.js`
 * entries are `require`d and `.mjs` entries imported, as Lambda's Node
 * runtime does.
 *
 * What it does NOT prove: that a handler works when invoked (the per-function
 * suites in `netlify/functions/_tests/` cover behaviour, with mocks), or
 * anything about Netlify's build image beyond the zip-it-and-ship-it version
 * installed here. Specifically, Netlify's buildbot runs its own auto-updated
 * @netlify/build / zip-it-and-ship-it rather than this repo's (14.5.4);
 * server-side zisi feature flags aren't passed (`zisi_pure_esm` would switch
 * the output to ESM); an `AWS_LAMBDA_JS_RUNTIME` override in the Netlify UI
 * is invisible here; and the child process runs on local Node, not Lambda's.
 * bundleFunctions.mjs's header lists the same gaps from the bundling side.
 */
import {execFileSync, spawn} from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {listScenarios} from './replay/scenario.mjs'
import {replayAll} from './replay/replayAll.mjs'
import {UNPROBED_FUNCTIONS, formatResults, smokeFunctions} from './smokeFunctions.mjs'


const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../..')
const FUNCTIONS_DIR = path.join(REPO_ROOT, 'netlify', 'functions')
const PRO_MODULES_SRC_DIR = path.join(FUNCTIONS_DIR, '_pro-modules')
const BUNDLE_SCRIPT = path.join(__dirname, 'bundleFunctions.mjs')
const SERVE_SCRIPT = path.join(__dirname, 'serveBundles.mjs')
const BUNDLE_TIMEOUT_MS = 120000
const LOAD_TIMEOUT_MS = 30000

// Every top-level file in the functions dir is a function to Netlify,
// whatever its extension; subdirectories (`_lib`, `_tests`, `_pro-modules`)
// carry no same-named entry file, so zip-it-and-ship-it skips them. Dotfiles
// (a macOS `.DS_Store`) aren't functions.
const FUNCTION_NAMES = fs.readdirSync(FUNCTIONS_DIR, {withFileTypes: true})
  .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
  .map((entry) => path.parse(entry.name).name)

// Deliberately no credentials: a function must load in a deploy context
// that lacks its secrets and answer "not configured", never crash on cold
// start. stripe-webhook used to build its Stripe client at module scope, and
// `Stripe(undefined)` throws, so this list once had to carry a dummy
// STRIPE_SECRET_KEY — which is exactly the crash it was hiding.
const LOAD_ENV = {
  NODE_ENV: 'test',
}
const REPLAY_TIMEOUT_MS = 180000
const SERVE_TIMEOUT_MS = 30000

// Every secret production has, so the smoke probes can be held to their
// `--strict` answers. `.invalid` hosts (RFC 6761) guarantee a probe that
// wrongly reaches upstream fails fast instead of touching a real service.
const PRODUCTION_LIKE_ENV = {
  NODE_ENV: 'production',
  AUTH0_DOMAIN: 'auth0.invalid',
  AUTH0_CLIENT_ID: 'smoke-client-id',
  AUTH0_CLIENT_SECRET: 'smoke-client-secret',
  STRIPE_SECRET_KEY: 'sk_test_smoke',
  STRIPE_WEBHOOK_SECRET: 'whsec_smoke',
  SHARE_PRO_PRICE_ID: 'price_smoke',
  GH_OAUTH_CLIENT_ID: 'smoke-gh-client-id',
  GH_OAUTH_CLIENT_SECRET: 'smoke-gh-client-secret',
}

// Runs inside the child. A v2 function's entry is Netlify's bootstrap, which
// wraps the handler with the Lambda runtime's `awslambda.streamifyResponse`
// global at import time, so it's stubbed for those alone. For a `.js` entry,
// Lambda's runtime `require`s it and falls back to `import()` only on
// ERR_REQUIRE_ESM; doing the same here keeps a CommonJS bundle on the
// CommonJS resolution path (the `require` export condition), where nft's
// missing `axios.cjs` is looked up.
const LOADER = `
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
const [entry, apiVersion] = process.argv.slice(1)
if (apiVersion === '2') {
  globalThis.awslambda = {streamifyResponse: (fn) => fn, HttpResponseStream: {from: (s) => s}}
}
let mod
if (entry.endsWith('.mjs')) {
  mod = await import(pathToFileURL(entry).href)
} else {
  try {
    mod = createRequire(entry)(entry)
  } catch (err) {
    if (err.code !== 'ERR_REQUIRE_ESM') {
      throw err
    }
    mod = await import(pathToFileURL(entry).href)
  }
}
if (typeof mod.handler !== 'function') {
  throw new Error('handler export is ' + typeof mod.handler)
}
`


describe('netlify functions as deployed', () => {
  let outDir
  let functionsConfig
  const bundles = new Map()

  beforeAll(() => {
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bldrs-netlify-fns-'))
    const stdout = execFileSync(process.execPath, [BUNDLE_SCRIPT, outDir], {
      cwd: REPO_ROOT,
      timeout: BUNDLE_TIMEOUT_MS,
    })
    const summary = JSON.parse(stdout.toString())
    functionsConfig = summary.functionsConfig
    for (const bundle of summary.bundles) {
      bundles.set(bundle.name, bundle)
    }
  }, BUNDLE_TIMEOUT_MS)

  afterAll(() => {
    if (outDir) {
      fs.rmSync(outDir, {recursive: true, force: true})
    }
  })

  it('bundles outside any node_modules tree, so a missing file cannot resolve from the repo', () => {
    expect(FUNCTION_NAMES).toContain('record-load')
    // Every ancestor up to and including the filesystem root: Node's lookup
    // ends at `/node_modules`, so that one counts too.
    let dir = outDir
    for (;;) {
      expect(fs.existsSync(path.join(dir, 'node_modules')), `${dir}/node_modules exists`).toBe(false)
      if (dir === path.dirname(dir)) {
        break
      }
      dir = path.dirname(dir)
    }
  })

  it('keeps shipping the built pro modules beside the pro-module function', () => {
    expect(functionsConfig['pro-module'].included_files).toContain('netlify/functions/_pro-modules/*.js')
    // The config only says what to include; check the files really landed.
    // `_pro-modules/` is gitignored and populated by `yarn build-prod`, so a
    // fresh checkout has none and only the config assertion above runs —
    // there is nothing on disk to compare against, and failing would make
    // the hook depend on a prior build. Where a build has run, each built
    // module must be in the bundle, at the repo-relative path zip-it-and-ship-it
    // 14.5.4 keeps (pro-module.js also tries the task-root-relative one).
    const built = fs.existsSync(PRO_MODULES_SRC_DIR) ?
      fs.readdirSync(PRO_MODULES_SRC_DIR).filter((name) => name.endsWith('.js')) :
      []
    const bundle = bundles.get('pro-module')
    expect(bundle, 'no bundle for pro-module').toBeDefined()
    for (const name of built) {
      const shipped = path.join(bundle.path, 'netlify', 'functions', '_pro-modules', name)
      expect(fs.existsSync(shipped), `${name} missing from the pro-module bundle (${shipped})`).toBe(true)
    }
  })

  it.each(FUNCTION_NAMES)('%s is bundled with esbuild unless it is a v2 function', (name) => {
    const bundle = bundles.get(name)
    expect(bundle, `no bundle for ${name}`).toBeDefined()
    // v2 functions are always nft (zip-it-and-ship-it ignores node_bundler
    // for them); see netlify.toml.
    expect(bundle.bundler).toBe(bundle.runtimeAPIVersion === 2 ? 'nft' : 'esbuild')
  })

  it.each(FUNCTION_NAMES)('%s loads from its bundle and exports a handler', (name) => {
    const bundle = bundles.get(name)
    expect(bundle, `no bundle for ${name}`).toBeDefined()
    // execFileSync throws on a non-zero exit with the child's stderr (the
    // `Cannot find module …/axios.cjs` text) in the message.
    execFileSync(process.execPath, [
      '--input-type=module', '-e', LOADER,
      path.join(bundle.path, bundle.entryFilename), String(bundle.runtimeAPIVersion),
    ], {
      cwd: bundle.path,
      // No HOME: Node's CommonJS resolver also searches `$HOME/.node_modules`,
      // which is one more way to resolve a file the bundle doesn't hold.
      env: {PATH: process.env.PATH, ...LOAD_ENV},
      stdio: 'pipe',
      timeout: LOAD_TIMEOUT_MS,
    })
  }, LOAD_TIMEOUT_MS)

  // Loading proves the entry resolves; replaying proves the handler WORKS
  // from the bundle — axios's http adapter, the Stripe SDK's client and
  // Sentry's wrapper all run, which is where a file missing from the zip
  // shows up at request time rather than import time. Same scenario files
  // as netlify/functions/_tests/replaySource.test.js (the source-level run),
  // so a scenario green there and red here is a packaging fault.
  describe('replaying recorded traffic against the bundles', () => {
    const scenarios = listScenarios()
    let results

    beforeAll(async () => {
      results = await replayAll(scenarios.map((scenario) => {
        const bundle = bundles.get(scenario.functionName)
        if (!bundle) {
          return {id: scenario.id, file: scenario.file, entry: '/nonexistent', loadMode: 'import'}
        }
        // A v2 bundle's entry is Netlify's streaming bootstrap, which needs
        // the Lambda runtime; its handler is the bundled user module beside it.
        const v2 = bundle.runtimeAPIVersion === 2
        return {
          id: scenario.id,
          file: scenario.file,
          entry: v2 ?
            path.join(bundle.path, 'functions', `${scenario.functionName}.mjs`) :
            path.join(bundle.path, bundle.entryFilename),
          loadMode: v2 ? 'import' : 'require',
          cwd: bundle.path,
        }
      }), {env: {PATH: process.env.PATH}})
    }, REPLAY_TIMEOUT_MS)

    it.each(scenarios.map((scenario) => scenario.id))('%s', (id) => {
      expect(results.get(id).failures).toEqual([])
    })
  })

  // The deployed smoke test (tools/netlify/smokeFunctions.mjs, run against
  // every deploy preview and hourly against production) pointed at these
  // bundles, served over HTTP the way the platform fronts them — once with
  // every production secret, held to the strict answers, and once with no
  // secrets at all, where each function must still give one of its lenient
  // (preview) answers rather than crash. smokeFunctions.test.js proves the
  // smoke test fails when it should.
  describe.each([
    ['production-like env, strict', PRODUCTION_LIKE_ENV, true],
    ['no secrets, lenient', LOAD_ENV, false],
  ])('smoke test against the bundles served over HTTP (%s)', (label, env, strict) => {
    let server
    let baseUrl

    beforeAll(async () => {
      const summaryFile = path.join(outDir, 'bundles.json')
      fs.writeFileSync(summaryFile, JSON.stringify({bundles: [...bundles.values()]}))
      server = spawn(process.execPath, [SERVE_SCRIPT, summaryFile, '0'], {
        cwd: outDir,
        env: {PATH: process.env.PATH, ...env},
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const port = await new Promise((resolve, reject) => {
        let stderr = ''
        server.stderr.on('data', (chunk) => {
          stderr += chunk
        })
        server.stdout.on('data', (chunk) => {
          const m = String(chunk).match(/LISTENING (\d+)/)
          if (m) {
            resolve(Number(m[1]))
          }
        })
        server.on('exit', (code) => reject(new Error(`serveBundles exited ${code}: ${stderr}`)))
      })
      baseUrl = `http://127.0.0.1:${port}`
    }, SERVE_TIMEOUT_MS)

    afterAll(() => {
      if (server) {
        server.kill()
      }
    })

    it('every function gives an accepted answer to its smoke probe', async () => {
      const results = await smokeFunctions(baseUrl, {strict, retryDelayMs: 0})
      expect(results.filter((r) => !r.ok), formatResults(results, baseUrl, strict)).toEqual([])
      expect(results.map((r) => r.name).sort())
        .toEqual([...bundles.keys()].filter((name) => !(name in UNPROBED_FUNCTIONS)).sort())
    }, SERVE_TIMEOUT_MS)
  })
})
