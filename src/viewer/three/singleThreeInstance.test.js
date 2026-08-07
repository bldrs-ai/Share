import {execSync} from 'child_process'
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
 * POSIX `find` (CI is Linux, dev machines macOS) and yarn-classic's real
 * directories (no pnpm/workspace symlink store to resolve).
 */
describe('single three instance', () => {
  it('installs exactly one three copy (no duplicate anywhere in node_modules)', () => {
    const repoRoot = path.resolve(__dirname, '../../..')
    // Every three *package* dir is named `three` and sits under a node_modules;
    // @types/three is a different package (the type stubs) — exclude it.
    // -prune stops descent into three's own subtree (nothing named three there).
    const out = execSync(
      `find node_modules -type d -name three -not -path '*/@types/*' -prune`,
      {cwd: repoRoot, encoding: 'utf8'})
    const threeDirs = out.split('\n').map((line) => line.trim()).filter(Boolean)

    // More than one entry ⇒ a duplicate three is installed. Dedupe the
    // offending dependency (or align versions) rather than relaxing this.
    expect(threeDirs).toEqual(['node_modules/three'])
  })
})
