import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {HEAVY_SPEC_FILES, heavySpecGlobs, resolveSpecSet} from './playwrightSpecSets.js'


// The config's testDir is `../src` relative to tools/.
const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src')


describe('playwrightSpecSets', () => {
  // A renamed or deleted heavy spec does not lose tests (the light pass
  // only ignores listed paths, so the file runs there), but it silently
  // puts every slow test back in one shard (#1892). Fail here instead.
  it.each(HEAVY_SPEC_FILES)('heavy spec %s exists under src/', (file) => {
    expect(fs.existsSync(path.join(SRC_DIR, file))).toBe(true)
  })

  it('lists only Conway flow specs the default config would pick up', () => {
    for (const file of HEAVY_SPEC_FILES) {
      expect(file).toMatch(/\.spec\.ts$/)
      expect(file).not.toMatch(/\.webifc\.spec\.ts$/)
    }
  })

  it('leaves the default config untouched when PW_SPEC_SET is unset', () => {
    expect(resolveSpecSet(undefined)).toEqual({testMatch: null, testIgnore: []})
    expect(resolveSpecSet('')).toEqual({testMatch: null, testIgnore: []})
  })

  it('heavy matches exactly the heavy files, light ignores exactly them', () => {
    const globs = heavySpecGlobs()
    expect(globs).toEqual(HEAVY_SPEC_FILES.map((f) => `**/${f}`))
    expect(resolveSpecSet('heavy')).toEqual({testMatch: globs, testIgnore: []})
    expect(resolveSpecSet('light')).toEqual({testMatch: null, testIgnore: globs})
  })

  it('throws on an unknown value instead of running everything', () => {
    expect(() => resolveSpecSet('Heavy')).toThrow(/PW_SPEC_SET/)
    expect(() => resolveSpecSet('all')).toThrow(/PW_SPEC_SET/)
  })
})
