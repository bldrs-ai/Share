import esbuild from 'esbuild'
import fs from 'node:fs'
import * as path from 'node:path'
import {fileURLToPath} from 'url'
import config from './common.js'


const mainBuild = esbuild.build(config)

// Worker
const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../../../')
const workerFile = path.resolve(repoRoot, 'src', 'OPFS', 'OPFS.worker.js')
const buildDir = path.resolve(repoRoot, 'docs')
const workerBuild = esbuild.build({
  ...config,
  entryPoints: [workerFile],
  outfile: path.join(buildDir, 'OPFS.Worker.js'),
  outdir: undefined,
  // Build worker as ESM bundle - requires {type: 'module'} when loading
  format: 'esm',
})


// Wait for both builds to complete
Promise.all([mainBuild, workerBuild])
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
