import esbuild from 'esbuild'
import fs from 'node:fs'
import * as path from 'node:path'
import {fileURLToPath} from 'url'
import config from './common.js'
import defines from './defines.js'


const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../../../')
const workerFile = path.resolve(repoRoot, 'src', 'OPFS', 'OPFS.worker.js')
const buildDir = path.resolve(repoRoot, 'docs')

// Build worker as IIFE bundle (no exports, just executes code)
// This allows ESM imports inside but bundles to a format that works in workers
const workerBuild = esbuild.build({
  entryPoints: [workerFile],
  outfile: path.join(buildDir, 'OPFS.Worker.js'),
  format: 'iife',
  platform: 'browser',
  target: ['chrome64', 'firefox62', 'safari11.1', 'edge79', 'es2021'],
  bundle: true,
  minify: (process.env.MINIFY || 'true') === 'true',
  keepNames: true,
  splitting: false,
  metafile: true,
  sourcemap: true,
  logLevel: 'info',
  define: defines,
  resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
  banner: {
    js: '// Worker file - no exports',
  },
})

// Build main application
const mainBuild = esbuild.build(config)

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
