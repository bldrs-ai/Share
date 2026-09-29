#!/usr/bin/env node
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {resolveConfig} from '@netlify/config'
import {zipFunctions} from '@netlify/zip-it-and-ship-it'


/**
 * Bundles every Netlify Function the way a deploy does, into `<outDir>`, and
 * prints a JSON summary to stdout: `{functionsConfig, bundles: [{name,
 * bundler, runtimeAPIVersion, path, entryFilename}]}`.
 *
 * What it mirrors from a real deploy:
 *  - netlify.toml is resolved by `@netlify/config`, the package the build
 *    itself uses, so `[functions]` / `[functions."name"]` precedence is
 *    Netlify's rather than a regex's.
 *  - Each resolved entry is translated to zip-it-and-ship-it's option names
 *    the way `@netlify/build`'s `normalizeFunctionConfig`
 *    (lib/plugins_core/functions/zisi.js) does, including `esbuild` →
 *    `esbuild_zisi`. That module isn't a public export, hence the copy in
 *    `toZisiConfig`; keep the two in step.
 *  - `archiveFormat: 'none'` writes the same file tree the `.zip` would hold
 *    (checked by diffing an unzipped zip against it), without needing an
 *    `unzip` binary to read it back.
 *
 * What it cannot mirror (so a green run here is necessary, not sufficient):
 *  - Netlify's buildbot runs its own, auto-updated
 *    `@netlify/build` / zip-it-and-ship-it, not the version in this repo's
 *    package.json (14.5.4 when this was written); a bundler change on their
 *    side lands without a commit here.
 *  - Server-side zip-it-and-ship-it feature flags aren't passed (`featureFlags`
 *    is left at its defaults). E.g. `zisi_pure_esm` would switch the output
 *    from CommonJS to ESM, changing what a cold start resolves.
 *  - An `AWS_LAMBDA_JS_RUNTIME` override set in the Netlify UI (it picks the
 *    Node version the function targets) is invisible to a checkout.
 *  - The load step runs on this machine's Node, not Lambda's.
 *
 * Separate script rather than inline in the test because both packages are
 * ESM-only and depend on `#subpath` imports Jest's resolver can't follow.
 * Driven by tools/netlify/functionBundler.test.js, which loads each bundle.
 *
 * Usage: `node tools/netlify/bundleFunctions.mjs <outDir>` — pick an
 * `<outDir>` outside the repo, or a bundle missing a dependency will still
 * resolve it from the repo's `node_modules` when you load it.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')


/**
 * Mirror of @netlify/build's `normalizeFunctionConfig` for the keys this
 * repo's netlify.toml can set. `nodeVersion` is `[build.environment]
 * NODE_VERSION`, which the build hands zip-it-and-ship-it as the user's Node
 * version.
 *
 * @param {object} functionConfig One resolved `config.functions[glob]` entry
 * @param {string|undefined} nodeVersion
 * @return {object} zip-it-and-ship-it per-glob config
 */
function toZisiConfig(functionConfig, nodeVersion) {
  return {
    externalNodeModules: functionConfig.external_node_modules,
    includedFiles: functionConfig.included_files,
    includedFilesBasePath: REPO_ROOT,
    ignoredNodeModules: functionConfig.ignored_node_modules,
    nodeVersion,
    nodeBundler: functionConfig.node_bundler === 'esbuild' ? 'esbuild_zisi' : functionConfig.node_bundler,
  }
}


const outDir = process.argv[2]
if (!outDir) {
  console.error('usage: bundleFunctions.mjs <outDir>')
  process.exit(2)
}

const {config} = await resolveConfig({
  repositoryRoot: REPO_ROOT,
  cwd: REPO_ROOT,
  offline: true,
  mode: 'buildbot',
  context: 'deploy-preview',
})
const nodeVersion = config.build.environment?.NODE_VERSION
const zisiConfig = Object.fromEntries(Object.entries(config.functions)
  .map(([glob, entry]) => [glob, toZisiConfig(entry, nodeVersion)]))
const results = await zipFunctions(
  {user: {directories: [config.functionsDirectory]}},
  path.resolve(outDir),
  {basePath: REPO_ROOT, repositoryRoot: REPO_ROOT, config: zisiConfig, archiveFormat: 'none'})

process.stdout.write(JSON.stringify({
  functionsConfig: config.functions,
  bundles: results.map(({name, bundler, runtimeAPIVersion, path: bundlePath, entryFilename}) =>
    ({name, bundler, runtimeAPIVersion, path: bundlePath, entryFilename})),
}))
