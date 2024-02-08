import esbuild from 'esbuild'
import fs from 'node:fs'
import {join} from 'node:path'
import * as common from './common.js'


esbuild
    .build(common.build)
    .then((result) => {
      // Remove development resources from non-development builds
      if (process.env.DISABLE_MOCK_SERVICE_WORKER === 'true') {
        fs.unlink(join(common.buildDir, 'mockServiceWorker.js'), (err) => console.log(err))
      }
      const metaFilename = './tools/esbuild/bundle-analysis.json'
      fs.writeFileSync(metaFilename, JSON.stringify(result.metafile))
      console.log(`Build succeeded.  Bundle analysis at: ${metaFilename}`)
    })
    .catch(() => process.exit(1))
