import {execSync} from 'child_process'
import fs from 'fs'
import path from 'path'


/**
 * Dependency-hygiene guard for three.
 *
 * three warns "Multiple instances of Three.js being imported." at runtime when
 * its `window.__THREE__` marker is already set — a real signal that two copies
 * of three were loaded. `tools/jest/setupTests.js` mutes that console warning
 * because under jest it is a false positive (the viewer harness resets the
 * module registry and re-imports three). Muting it means a genuinely
 * duplicated three — a nested `node_modules/three` pulled in by some
 * dependency's version range — would no longer surface via the console, so
 * this test is the compensating detector for that install-on-disk case.
 *
 * Scope: a static scan of the installed tree, so it catches a second copy
 * present in node_modules at ANY depth; it can't catch a duplicate created
 * purely at runtime (nothing static can). Uses `find` — a JS recursion over
 * node_modules took ~17s, near the jest timeout; this is ~1s. Assumes a
 * POSIX `find` (CI is Linux, dev machines macOS).
 *
 * Layout: bunfig.toml's isolated linker keeps one real directory per
 * name@version under `node_modules/.bun/<name>@<version>/node_modules/` and
 * reaches it through symlinks — `node_modules/three` and every dependent's
 * `.bun/<dep>/node_modules/three` point at it, and `.bun/node_modules/three`
 * is Bun's own fallback link. So entries named `three` are counted by the
 * directory they resolve to, not by path: several links to one copy are
 * fine, two real copies are the failure. `find` doesn't follow symlinks, so
 * it can't loop through the store.
 */
describe('single three instance', () => {
  it('installs exactly one three copy (no duplicate anywhere in node_modules)', () => {
    const repoRoot = path.resolve(__dirname, '../../..')
    // Every three *package* entry is named `three` and sits under a
    // node_modules, as a directory or a link to one; @types/three is a
    // different package (the type stubs) — exclude it. -prune stops descent
    // into three's own subtree (nothing named three there).
    const out = execSync(
      `find node_modules -name three -not -path '*/@types/*' \\( -type d -o -type l \\) -prune`,
      {cwd: repoRoot, encoding: 'utf8'})
    const entries = out.split('\n').map((line) => line.trim()).filter(Boolean)
    const copies = new Set(entries
      .map((entry) => fs.realpathSync(path.join(repoRoot, entry)))
      .filter((dir) => readPackageName(dir) === 'three'))

    // More than one real directory ⇒ a duplicate three is installed. Dedupe
    // the offending dependency (or align versions) rather than relaxing this.
    expect([...copies]).toEqual([fs.realpathSync(path.join(repoRoot, 'node_modules/three'))])
  })
})


/**
 * @param {string} dir A directory a `three` entry resolved to
 * @return {string|undefined} Its package.json name, if it has one
 */
function readPackageName(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).name
  } catch (e) {
    return undefined
  }
}
