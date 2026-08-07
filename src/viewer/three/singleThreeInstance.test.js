import fs from 'fs'
import path from 'path'


/**
 * Dependency-hygiene guard for three.
 *
 * three warns "Multiple instances of Three.js being imported." at runtime when
 * its `window.__THREE__` marker is already set — a real signal that two copies
 * of three were bundled. `tools/jest/setupTests.js` mutes that console warning
 * because under jest it is a false positive (the viewer harness resets the
 * module registry and re-imports three). Muting it means a *genuine* duplicate
 * — a nested `node_modules/three` pulled by some dependency's version range —
 * would no longer surface via the console. This test is the real detector: it
 * asserts the installed tree carries exactly one three.
 */
describe('single three instance', () => {
  it('has no duplicate three nested under any node_modules', () => {
    const root = path.resolve(__dirname, '../../../node_modules')

    /**
     * Record a nested three copy if `pkgDir/node_modules/three` exists.
     *
     * @param {string} pkgDir absolute path to a package directory
     * @param {Array<string>} out collector of root-relative offender paths
     */
    function collectNestedThree(pkgDir, out) {
      const nestedThreePkg = path.join(pkgDir, 'node_modules', 'three', 'package.json')
      if (fs.existsSync(nestedThreePkg)) {
        out.push(path.relative(root, nestedThreePkg))
      }
    }

    // A duplicate hoists to node_modules/<pkg>/node_modules/three or
    // node_modules/@scope/<pkg>/node_modules/three — check exactly those two
    // shapes (two readdir levels) rather than walking the whole tree.
    const nested = []
    for (const entry of fs.readdirSync(root, {withFileTypes: true})) {
      if (!entry.isDirectory() || entry.name === '.bin') {
        continue
      }
      if (entry.name.startsWith('@')) {
        const scopeDir = path.join(root, entry.name)
        for (const scoped of fs.readdirSync(scopeDir, {withFileTypes: true})) {
          if (scoped.isDirectory()) {
            collectNestedThree(path.join(scopeDir, scoped.name), nested)
          }
        }
      } else {
        collectNestedThree(path.join(root, entry.name), nested)
      }
    }

    // A non-empty list means a second three copy is installed — dedupe the
    // offending dependency (or align versions) rather than relaxing this.
    expect(nested).toEqual([])
  })
})
