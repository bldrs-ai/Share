import esbuild from 'esbuild'
import fs from 'node:fs'
import {join} from 'node:path'
import config from './common.js'


esbuild
    .build(config)
    .then((result) => {
      // Remove development resources from non-development builds
      if (process.env.DISABLE_MOCK_SERVICE_WORKER === 'true') {
        fs.unlink(join(config.buildDir, 'mockServiceWorker.js'), (err) => {
          // eslint-disable-next-line no-console
          console.log(err)
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
      // eslint-disable-next-line no-console
      console.error(`Build failed:`, err)
      process.exit(1)
    })
