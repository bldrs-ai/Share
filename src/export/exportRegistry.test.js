import {EXPORT_FORMATS, getExportFormat, shippedExportFormats} from './exportRegistry'


describe('exportRegistry', () => {
  it('ships exactly GLB today', () => {
    // The UI renders from this list, so "what has shipped" is a fact about
    // the registry rather than about a doc. A second shipped format must
    // arrive with its own pro module and its own E2E coverage.
    expect(shippedExportFormats().map((f) => f.id)).toEqual(['glb'])
  })

  it('names the pro module the loader will fetch for GLB', () => {
    expect(getExportFormat('glb')).toMatchObject({
      ext: 'glb',
      mime: 'model/gltf-binary',
      moduleName: 'glbExport',
      source: 'artifact',
    })
  })

  it('gives every row a unique id and a complete shape', () => {
    const ids = EXPORT_FORMATS.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const format of EXPORT_FORMATS) {
      expect(typeof format.label).toBe('string')
      expect(typeof format.moduleName).toBe('string')
      // `source` decides where the bytes come from and therefore whether the
      // module can be dependency-free (artifact) or needs the host's three
      // instance (scene) — design/new/glb-export-premium.md §6.1.
      expect(['artifact', 'scene']).toContain(format.source)
      expect(['shipped', 'planned']).toContain(format.status)
    }
  })

  it('returns undefined for an unknown id', () => {
    expect(getExportFormat('dwg')).toBeUndefined()
  })
})
