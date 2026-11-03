import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'


const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..')

// Google Identity Services OAuth popup delivers tokens via postMessage on
// window.opener. A stricter COOP nulls the opener in the cross-origin popup
// and breaks the flow with a silent "Google sign-in was cancelled" — see
// GoogleDriveProvider.ts error_callback. Prod and dev must both stay on
// same-origin-allow-popups (or looser) while GIS is in use.
const REQUIRED_COOP = 'same-origin-allow-popups'
// SPIKE (#1610 re-measure, do not merge): the deploy headers are flipped to
// full isolation so a deploy preview runs Conway's MT wasm. The dev proxy
// keeps the GIS-safe policy above; only netlify.toml is pinned to this.
const SPIKE_NETLIFY_COOP = 'same-origin'
const SPIKE_NETLIFY_COEP = 'credentialless'

describe('Cross-Origin-Opener-Policy', () => {
  it('netlify.toml root route is cross-origin isolated (#1610 spike)', () => {
    const toml = fs.readFileSync(path.join(REPO_ROOT, 'netlify.toml'), 'utf8')
    const rootBlock = extractHeadersBlock(toml, '/*')
    expect(rootBlock).not.toBeNull()
    const coop = /Cross-Origin-Opener-Policy\s*=\s*"([^"]+)"/.exec(rootBlock)
    expect(coop).not.toBeNull()
    expect(coop[1]).toBe(SPIKE_NETLIFY_COOP)
    const coep = /Cross-Origin-Embedder-Policy\s*=\s*"([^"]+)"/.exec(rootBlock)
    expect(coep).not.toBeNull()
    expect(coep[1]).toBe(SPIKE_NETLIFY_COEP)
  })

  it('dev proxy sends same-origin-allow-popups for app routes', () => {
    const proxy = fs.readFileSync(path.join(REPO_ROOT, 'tools/esbuild/proxy.js'), 'utf8')
    expect(proxy).toContain(`'Cross-Origin-Opener-Policy': '${REQUIRED_COOP}'`)
    expect(proxy).not.toMatch(/'Cross-Origin-Opener-Policy':\s*'same-origin'(?!-)/)
  })
})


/**
 * Extract the body of a `[[headers]]` block whose `for` field matches `forPath`.
 *
 * @param {string} toml Netlify config file contents.
 * @param {string} forPath The `for = "..."` value to match.
 * @return {string|null} The block body, or null if not found.
 */
function extractHeadersBlock(toml, forPath) {
  const blocks = toml.split(/\[\[headers\]\]/).slice(1)
  for (const block of blocks) {
    const forMatch = /for\s*=\s*"([^"]+)"/.exec(block)
    if (forMatch && forMatch[1] === forPath) {
      return block
    }
  }
  return null
}
