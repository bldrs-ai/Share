import * as path from 'node:path'
import {
  PRO_DEV_COPY_DIR,
  PRO_MODULE_OUT_DIR,
  proModuleNames,
  proModuleTargets,
} from './proModules.js'


/**
 * The gating premise of the whole pro-module design (design/new/
 * glb-export-premium.md §3 option C): premium code is never published.
 * `docs/` is what Netlify serves, so "not published" is exactly "no output
 * path under docs/" for a prod build — which is what these pin.
 */
describe('proModules', () => {
  const names = ['glbExport']

  it('emits every entry into netlify/functions/_pro-modules, never docs/', () => {
    const targets = proModuleTargets({shareConfig: 'prod', names})

    expect(targets).toHaveLength(1)
    expect(targets[0].outfile).toBe(path.join(PRO_MODULE_OUT_DIR, 'glbExport.js'))
    expect(targets[0].outfile).not.toContain(`${path.sep}docs${path.sep}`)
    expect(targets[0].entryFile.endsWith(path.join('src', 'export', 'pro', 'glbExport.entry.js'))).toBe(true)
  })

  it('makes no docs/ copy for prod', () => {
    for (const target of proModuleTargets({shareConfig: 'prod', names})) {
      expect(target.devCopyFile).toBeNull()
    }
  })

  it('makes no docs/ copy when SHARE_CONFIG is unset (which IS prod — see defines.js)', () => {
    // defines.js's switch falls through to prod for undefined and for any
    // unrecognised value, so the dev copy must be opt-IN by name rather than
    // "anything that isn't the string prod".
    expect(proModuleTargets({shareConfig: undefined, names})[0].devCopyFile).toBeNull()
    expect(proModuleTargets({shareConfig: 'cypress', names})[0].devCopyFile).toBeNull()
  })

  it('copies into docs/__pro_dev__ for dev and playwright, where no function runs', () => {
    for (const shareConfig of ['dev', 'playwright']) {
      const [target] = proModuleTargets({shareConfig, names})
      expect(target.devCopyFile).toBe(path.join(PRO_DEV_COPY_DIR, 'glbExport.js'))
    }
  })

  it('discovers the shipped entries from the source tree', () => {
    // Not a fixed list: a new `*.entry.js` must be picked up by the build
    // without anyone remembering to register it here.
    expect(proModuleNames()).toContain('glbExport')
  })
})
