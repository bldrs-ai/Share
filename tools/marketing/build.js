// Build the marketing site and overlay its static export onto docs/.
//
// Chained from `build-share` so every SPA build (yarn build, yarn serve,
// test-flows-build, Netlify deploys) produces the same merged tree. One
// pipeline, no drift between dev and prod.
//
// Marketing routes (/about/, /pricing/, /blog/, /sitemap.xml, ...) land in
// their own subdirectories inside docs/. The marketing build deliberately
// emits no out/index.html (root page.tsx was removed), so the SPA's
// docs/index.html survives the overlay and `/` keeps its react-router
// redirect to the homepage IFC model.
import {execSync} from 'node:child_process'
import {cpSync, existsSync, mkdirSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'


const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const MARKETING = path.join(REPO_ROOT, 'marketing')
const MARKETING_OUT = path.join(MARKETING, 'out')
const DOCS = path.join(REPO_ROOT, 'docs')


/**
 * Run a labeled child command, inheriting stdio so progress streams through.
 *
 * @param {string} label Human-readable description for the log line.
 * @param {string} cmd Shell command to run.
 * @param {string} cwd Working directory.
 */
function run(label, cmd, cwd) {
  // eslint-disable-next-line no-console
  console.log(`marketing: ${label}`)
  execSync(cmd, {cwd, stdio: 'inherit'})
}


run('installing deps (frozen lockfile)', 'yarn install --frozen-lockfile', MARKETING)
run('building static export', 'yarn build', MARKETING)

if (!existsSync(DOCS)) {
  mkdirSync(DOCS, {recursive: true})
}

// eslint-disable-next-line no-console
console.log(`marketing: overlaying ${path.relative(REPO_ROOT, MARKETING_OUT)} → ${path.relative(REPO_ROOT, DOCS)}`)
cpSync(MARKETING_OUT, DOCS, {recursive: true, force: true})
// eslint-disable-next-line no-console
console.log('marketing: done')
