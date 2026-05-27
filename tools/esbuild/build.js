import fs from 'node:fs'
import * as path from 'node:path'
import esbuild from 'esbuild'
import {fileURLToPath} from 'url'
import config from './common.js'


const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../../../')

// Main build
const indexFile = path.resolve(repoRoot, 'src', 'index.jsx')
const subscribeFile = path.resolve(repoRoot, 'src', 'subscribe', 'index.jsx')
const mainBuild = esbuild.build({
  ...config,
  entryPoints: [indexFile, subscribeFile],
})

// Workers
//
// Each worker entry produces TWO bundles: ESM (preferred, used when
// the browser supports module workers) + classic IIFE (fallback for
// old iOS, Samsung Internet, quirky Chromes). The service wrappers
// (`OPFSService.js`, `GlbWriterService.js`) feature-detect at
// runtime and pick the right URL.
const buildDir = path.resolve(repoRoot, 'docs')

/**
 * Stand up the ESM + classic-IIFE bundles for a worker source file.
 *
 * @param {string} sourceRelPath path relative to `src/`, e.g. `'OPFS/OPFS.worker.js'`
 * @param {string} bundleBaseName basename of the output, e.g. `'OPFS.worker'`
 *   — produces `<buildDir>/<bundleBaseName>.js` + `.classic.js`
 * @return {Array<Promise>} two esbuild build Promises
 */
function workerBuilds(sourceRelPath, bundleBaseName) {
  const sourceFile = path.resolve(repoRoot, 'src', sourceRelPath)
  const outBase = path.join(buildDir, bundleBaseName)
  return [
    esbuild.build({
      ...config,
      entryPoints: [sourceFile],
      outdir: undefined,
      outfile: `${outBase}.js`,
      format: 'esm',
    }),
    esbuild.build({
      ...config,
      entryPoints: [sourceFile],
      outdir: undefined,
      outfile: `${outBase}.classic.js`,
      format: 'iife',
    }),
  ]
}

const opfsBuilds = workerBuilds('OPFS/OPFS.worker.js', 'OPFS.worker')
// GlbWriter worker — runs JSON.stringify + pako.gzip + extension
// injection + Bldrs container packing off the main thread so
// hover-pick / camera-controls stay responsive during the post-IFC-
// parse write. See `src/loader/GlbWriter.worker.js`.
const glbWriterBuilds = workerBuilds('loader/GlbWriter.worker.js', 'GlbWriter.worker')


// Wait for every build to complete
Promise.all([mainBuild, ...opfsBuilds, ...glbWriterBuilds])
  .then(([result]) => {
    // Remove development resources from non-development builds
    if (config.define['process.env.MSW_IS_ENABLED'] !== 'true') {
      // eslint-disable-next-line no-console
      console.log('Removing MSW from build')
      fs.unlink(path.join(config.outdir, 'mockServiceWorker.js'), (err) => {
        if (err !== null) {
          console.warn('Unknown return from MSW unlink.  Expected null on success, got:', err)
        }
      })
    }
    if (process.env.ANALYZE === 'true') {
      const metaFilename = './tools/esbuild/bundle-analysis.json'
      fs.writeFileSync(metaFilename, JSON.stringify(result.metafile))
      // eslint-disable-next-line no-console
      console.log(`Bundle analysis at: ${metaFilename}`)
    }
    // eslint-disable-next-line no-console
    console.log('Build succeeded.')
  })
  .catch((err) => {
    console.error('Build failed:', err)
    process.exit(1)
  })
