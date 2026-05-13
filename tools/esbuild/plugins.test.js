// Unit tests for the threeJsmCompat plugin's pure string-rewrite helpers.
// Each helper is exercised against a synthetic source string that mirrors
// the fork's current shape, plus a no-op input to verify the hit-assertion
// guard throws. The latter is the value proposition of these tests: if a
// future yarn install pulls a fork repack with even slight whitespace
// drift, the build fails loudly with a named helper instead of the bug
// resurfacing at runtime.

import {
  assertReplaced,
  patchPlanesTransformControls,
  scaleLightIntensities,
  shimBufferGeometryUtils,
  shimClock,
} from './plugins.js'


describe('assertReplaced', () => {
  it('returns the post-replace string when it actually changed', () => {
    expect(assertReplaced('a', 'b', 'test')).toBe('b')
  })

  it('throws when the replace was a no-op', () => {
    expect(() => assertReplaced('a', 'a', 'planes.js: scene.add(controls)'))
      .toThrow(/rewrite "planes\.js: scene\.add\(controls\)" did not match/)
  })
})


describe('shimBufferGeometryUtils', () => {
  it('appends the mergeBufferGeometries alias re-export', () => {
    const src = `export { mergeGeometries } from './something.js';\n`
    const out = shimBufferGeometryUtils(src)
    expect(out).toContain(src)
    expect(out).toMatch(
      /export \{ mergeGeometries as mergeBufferGeometries \} from '\.\/BufferGeometryUtils\.js'/)
  })
})


describe('patchPlanesTransformControls', () => {
  it('rewrites all five fork call-sites to use getHelper()', () => {
    // Synthetic source modeled on web-ifc-viewer's planes.js.
    const src = [
      `scene.add(controls);`,
      `this.context.renderer.postProduction.excludedItems.add(controls);`,
      `controls.children[0].children[0].add(this.arrowBoundingBox);`,
      `this.controls.visible = state;`,
      `this.controls.removeFromParent();`,
    ].join('\n')

    const out = patchPlanesTransformControls(src)

    expect(out).toContain('scene.add((controls.getHelper ? controls.getHelper() : controls))')
    expect(out).toContain(
      'this.context.renderer.postProduction.excludedItems.add' +
      '((controls.getHelper ? controls.getHelper() : controls))')
    expect(out).toContain(
      '(controls.getHelper ? controls.getHelper() : controls).children[0].children[0].add')
    expect(out).toContain('(this.controls.getHelper ? this.controls.getHelper() : this.controls).visible = state')
    expect(out).toContain(
      '(this.controls.getHelper ? this.controls.getHelper() : this.controls).removeFromParent()')
  })

  it('throws if the first replace would no-op (fork-shape drift)', () => {
    // Missing `scene.add(controls);` — assertion fires on the first rewrite.
    const src = `this.controls.removeFromParent();`
    expect(() => patchPlanesTransformControls(src))
      .toThrow(/planes\.js: scene\.add\(controls\)/)
  })

  it('throws if any subsequent replace would no-op', () => {
    // Has the first call-site but not the third.
    const src = [
      `scene.add(controls);`,
      `this.context.renderer.postProduction.excludedItems.add(controls);`,
      // controls.children[...] line is missing — should fire here.
      `this.controls.visible = state;`,
      `this.controls.removeFromParent();`,
    ].join('\n')
    expect(() => patchPlanesTransformControls(src))
      .toThrow(/controls\.children\[0\]/)
  })
})


describe('scaleLightIntensities', () => {
  it('multiplies the three hardcoded light intensities by Math.PI', () => {
    const src = [
      `new DirectionalLight(0xffeeff, 0.8)`,
      `new DirectionalLight(0xffffff, 0.8)`,
      `new AmbientLight(0xffffee, 0.25)`,
    ].join('\n')

    const out = scaleLightIntensities(src)

    expect(out).toContain('new DirectionalLight(0xffeeff, 0.8 * Math.PI)')
    expect(out).toContain('new DirectionalLight(0xffffff, 0.8 * Math.PI)')
    expect(out).toContain('new AmbientLight(0xffffee, 0.25 * Math.PI)')
  })

  it('throws if any of the three constructors fails to match', () => {
    // Wrong hex on the first DirectionalLight; assertion fires.
    const src = [
      `new DirectionalLight(0xff0000, 0.8)`,
      `new DirectionalLight(0xffffff, 0.8)`,
      `new AmbientLight(0xffffee, 0.25)`,
    ].join('\n')
    expect(() => scaleLightIntensities(src))
      .toThrow(/scene\.js: DirectionalLight\(0xffeeff, 0\.8\)/)
  })
})


describe('shimClock', () => {
  it('strips Clock from the three import and inlines an API-compatible class', () => {
    const src = `import { Clock, Vector2, Vector3 } from 'three';\n` +
      `// ... fork code that does new Clock(true) and clock.getDelta() ...`

    const out = shimClock(src)

    // Clock is gone from the named import, other names preserved.
    expect(out).toMatch(/import \{ Vector2, Vector3 \} from 'three';/)
    expect(out).not.toMatch(/import \{[^}]*\bClock\b[^}]*\} from 'three';/)
    // Inline Clock class is present with the API the fork uses.
    expect(out).toContain('class Clock')
    expect(out).toContain('performance.now()')
    expect(out).toContain('getDelta()')
  })

  it('throws when no Clock import line is present (fork-shape drift)', () => {
    const src = `import { Vector2 } from 'three';\n`
    expect(() => shimClock(src)).toThrow(/Clock import strip/)
  })
})
