import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'


const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../..')

// The functions this pins are the ones written in ESM that import axios (via
// `_lib/auth0.js`). Under Netlify's default bundler (nft) an ESM function is
// transpiled to CommonJS, `import axios` becomes `require('axios')`, Node
// resolves that through axios's `require` export condition to
// `dist/node/axios.cjs`, and that file is not in the zip — the function
// crashes on cold start (#1837's deploy-preview 502, reproduced locally with
// `zip-it-and-ship-it netlify/functions <out>`). esbuild bundles the
// dependency into the function file instead.
const ESBUILD_BUNDLED_FUNCTIONS = ['pro-module', 'record-export']


describe('netlify.toml function bundling', () => {
  const toml = fs.readFileSync(path.join(REPO_ROOT, 'netlify.toml'), 'utf8')

  it.each(ESBUILD_BUNDLED_FUNCTIONS)('bundles %s with esbuild', (name) => {
    const block = toml.split(/\n(?=\[)/).find((section) => section.startsWith(`[functions."${name}"]`))
    expect(block).toBeDefined()
    expect(block).toMatch(/^\s*node_bundler\s*=\s*"esbuild"/m)
  })

  it('keeps shipping the built pro modules beside the pro-module function', () => {
    const block = toml.split(/\n(?=\[)/).find((section) => section.startsWith('[functions."pro-module"]'))
    expect(block).toMatch(/included_files\s*=\s*\["netlify\/functions\/_pro-modules\/\*\.js"\]/)
  })
})
