// Parses public/_redirects so dev and prod share one SPA allowlist.
//
// public/_redirects is what Netlify reads at deploy time. The local dev proxy
// (tools/esbuild/proxy.js) reads the same file at startup, so the two can't
// diverge — add an entry to _redirects and both runtimes pick it up.
//
// Only the subset we actually use is interpreted: `<from> /index.html 200`
// with optional `*` splat at the end of <from>. Other targets, status codes,
// or query/header modifiers are ignored with a warning, so adding a fancier
// rule won't silently de-sync dev.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'


const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_REDIRECTS_PATH = path.resolve(__dirname, '../../public/_redirects')


/**
 * Parses the _redirects file into RegExp matchers for SPA-fallback paths
 * (those that rewrite to `/index.html` with status 200).
 *
 * @param {string} [filePath] Override path to a _redirects file (tests).
 * @return {RegExp[]} Matchers for paths that should fall back to the SPA.
 */
export function loadSpaAllowlist(filePath = DEFAULT_REDIRECTS_PATH) {
  const src = fs.readFileSync(filePath, 'utf8')
  return parseSpaAllowlist(src)
}


/**
 * Parses _redirects file contents into SPA matchers. Split out from
 * loadSpaAllowlist so tests can feed it raw strings.
 *
 * @param {string} src Contents of a _redirects file.
 * @return {RegExp[]} Matchers for SPA-fallback paths.
 */
export function parseSpaAllowlist(src) {
  const matchers = []
  for (const rawLine of src.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (!line) {
      continue
    }
    const parts = line.split(/\s+/)
    if (parts.length < 3) {
      console.warn(`redirects: skipping malformed line: ${rawLine}`)
      continue
    }
    const [from, to, status] = parts
    if (to !== '/index.html' || status !== '200') {
      // Not an SPA rewrite — could be a redirect, asset proxy, etc. The dev
      // proxy doesn't need to know about those.
      continue
    }
    matchers.push(fromPatternToRegExp(from))
  }
  return matchers
}


/**
 * Tests whether a URL path matches any SPA-fallback matcher.
 *
 * @param {string} url Request URL (may include query/hash).
 * @param {RegExp[]} matchers From loadSpaAllowlist.
 * @return {boolean} True if the path should fall back to the SPA shell.
 */
export function isSpaPath(url, matchers) {
  const pathOnly = url.split('?')[0].split('#')[0]
  return matchers.some((re) => re.test(pathOnly))
}


/**
 * Convert a Netlify `from` pattern to a RegExp. Supports the subset we use:
 * literal paths and a trailing `*` splat.
 *
 *   /share/*        → ^\/share(?:\/.*)?$
 *   /ipsum          → ^\/ipsum$
 *
 * @param {string} from Netlify `from` pattern.
 * @return {RegExp}
 */
function fromPatternToRegExp(from) {
  const escaped = from
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\/\*$/, '(?:/.*)?')
  return new RegExp(`^${escaped}$`)
}
