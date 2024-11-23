import esbuild from 'esbuild'
import fs from 'node:fs'
import {join} from 'node:path'
import config from './common.js'


esbuild
    .build(config)
    .then((result) => {
      // Remove development resources from non-development builds
      if (config.define['process.env.MSW_IS_ENABLED'] !== 'true') {
        // eslint-disable-next-line no-console
        console.log('Removing MSW from build')
        fs.unlink(join(config.outdir, 'mockServiceWorker.js'), (err) => {
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
      console.log(`Build succeeded.`)
    })
    .catch((err) => {
      console.error(`Build failed:`, err)
      process.exit(1)
    })
