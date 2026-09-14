import fs from 'node:fs'
import * as path from 'node:path'
import {fileURLToPath} from 'node:url'
import esbuild from 'esbuild'
import config from './common.js'


// Pro-module build target (design/new/glb-export-premium.md §4.2).
//
// Premium export code must never be published: `docs/` is what Netlify
// serves, so anything built into it is a public static file regardless of
// which UI hides the button. Each `src/export/pro/*.entry.js` is therefore
// bundled on its own into `netlify/functions/_pro-modules/`, OUTSIDE the
// published dir and gitignored, where only the authenticated `pro-module`
// function can read it.
//
// Lives in its own module rather than in `build.js` because `build.js` starts
// the whole app build the moment it is imported — the tools jest test needs
// to inspect the target plan (prod emits nothing under `docs/`; dev does)
// without standing up esbuild at all.

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../../../')
const buildDir = path.resolve(repoRoot, 'docs')

export const PRO_ENTRY_DIR = path.resolve(repoRoot, 'src', 'export', 'pro')
export const PRO_ENTRY_SUFFIX = '.entry.js'
export const PRO_MODULE_OUT_DIR = path.resolve(repoRoot, 'netlify', 'functions', '_pro-modules')

// Where the dev/playwright copy lands. `yarn serve` and the Playwright build
// are both served by a plain static server with no Netlify functions running,
// so the MSW handler for `/.netlify/functions/pro-module` proxies to this
// copy instead. NEVER emitted for `prod` — that would publish the module.
export const PRO_DEV_COPY_DIR = path.resolve(buildDir, '__pro_dev__')

// The configs whose builds are served without functions, and therefore the
// only ones that get the `docs/` copy.
const DEV_SHARE_CONFIGS = new Set(['dev', 'playwright'])


/**
 * Entry basenames under `src/export/pro/`, e.g. `['glbExport']`.
 *
 * @param {string} [dir] Directory to scan; defaults to PRO_ENTRY_DIR
 * @return {Array<string>} module names, sorted
 */
export function proModuleNames(dir = PRO_ENTRY_DIR) {
  if (!fs.existsSync(dir)) {
    return []
  }
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(PRO_ENTRY_SUFFIX))
    .map((f) => f.slice(0, -PRO_ENTRY_SUFFIX.length))
    .sort()
}


/**
 * What a build of the pro modules would emit, without emitting it.
 *
 * @param {object} [args]
 * @param {string} [args.shareConfig] The SHARE_CONFIG value the build runs
 *   under; defaults to `process.env.SHARE_CONFIG`. Anything that is not
 *   'dev' or 'playwright' (including undefined, which is how `prod` is
 *   spelled by default — see defines.js's switch) gets no `docs/` copy.
 * @param {Array<string>} [args.names] Module names; defaults to a scan of
 *   PRO_ENTRY_DIR
 * @return {Array<{name: string, entryFile: string, outfile: string, devCopyFile: ?string}>}
 */
export function proModuleTargets({shareConfig = process.env.SHARE_CONFIG, names = proModuleNames()} = {}) {
  const wantsDevCopy = DEV_SHARE_CONFIGS.has(shareConfig)
  return names.map((name) => ({
    name,
    entryFile: path.join(PRO_ENTRY_DIR, `${name}${PRO_ENTRY_SUFFIX}`),
    outfile: path.join(PRO_MODULE_OUT_DIR, `${name}.js`),
    devCopyFile: wantsDevCopy ? path.join(PRO_DEV_COPY_DIR, `${name}.js`) : null,
  }))
}


/**
 * Build every pro module. One `esbuild.build` per entry, alongside the
 * worker builds in `build.js`.
 *
 * Overrides on the shared config, each load-bearing:
 *  - `sourcemap: false` — a sourcemap would ship the readable source of the
 *    thing being sold, next to the minified copy.
 *  - `minify: true` unconditionally, where the shared config honours
 *    `MINIFY=false`; same reason.
 *  - `outfile` + `outdir: undefined` — the shared config's `outdir` is
 *    `docs/`, which is exactly where this output must not go.
 *
 * @return {Array<Promise>} one build Promise per entry
 */
export function proModuleBuilds() {
  return proModuleTargets().map((target) => {
    fs.mkdirSync(path.dirname(target.outfile), {recursive: true})
    return esbuild.build({
      ...config,
      entryPoints: [target.entryFile],
      outdir: undefined,
      outfile: target.outfile,
      format: 'esm',
      bundle: true,
      minify: true,
      sourcemap: false,
    }).then((result) => {
      if (target.devCopyFile) {
        fs.mkdirSync(path.dirname(target.devCopyFile), {recursive: true})
        fs.copyFileSync(target.outfile, target.devCopyFile)
      }
      return result
    })
  })
}
