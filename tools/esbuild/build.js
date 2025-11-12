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

// Worker
const workerFile = path.resolve(repoRoot, 'src', 'OPFS', 'OPFS.worker.js')
const buildDir = path.resolve(repoRoot, 'docs')
const outfileBase = path.join(buildDir, 'OPFS.worker')

// ESM worker
const workerBuildESM = esbuild.build({
  ...config,
  entryPoints: [workerFile],
  outdir: undefined,
  outfile: `${outfileBase}.js`,
  format: 'esm',
})

// old iOS, Samsung Internet, quirky Chromes
const workerBuildClassic = esbuild.build({
  ...config,
  entryPoints: [workerFile],
  outdir: undefined,
  outfile: `${outfileBase}.classic.js`,
  format: 'iife',
})


// Wait for both builds to complete
Promise.all([mainBuild, workerBuildESM, workerBuildClassic])
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
