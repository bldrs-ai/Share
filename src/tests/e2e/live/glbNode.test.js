/** @jest-environment node */ // eslint-disable-line jsdoc/check-tag-names
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {hasNodeChain, loadGlbInThree, validateGlb} from './glbNode'


/* eslint-disable no-magic-numbers */
// Two real Share exports of `public/index.ifc` (the model the live specs
// load), saved from the mocked Export tab. They are fixtures for the CHECKER
// and stay valid as the exporter changes: each pins what the checker must
// see in a file of that shape.
const FIXTURES = join(process.cwd(), 'src', 'tests', 'e2e', 'live', '__fixtures__')
const read = (name) => new Uint8Array(readFileSync(join(FIXTURES, name)))
// index.ifc is 7 elements, 84 triangles in all.
const INDEX_IFC_TRIANGLES = 84
const SPATIAL_CHAIN = ['Bldrs', 'Build', 'Every', 'Thing', 'Together']


describe('live/glbNode', () => {
  describe('a portable Draco export', () => {
    const bytes = read('portable-draco.glb')

    it('validates clean, and reports Share\'s own extensions as unknown rather than wrong', async () => {
      const result = await validateGlb(bytes)
      expect(result.numErrors).toBe(0)
      expect(result.unsupportedExtensions).toEqual(expect.arrayContaining(['KHR_draco_mesh_compression', 'BLDRS_spatial_tree']))
    })

    it('decodes every triangle through the Draco stand-in and keeps the named hierarchy', async () => {
      const result = await loadGlbInThree(bytes)
      expect(result.triangleCount).toBe(INDEX_IFC_TRIANGLES)
      expect(result.meshCount).toBe(7)
      expect(hasNodeChain(result.paths, SPATIAL_CHAIN)).toBe(true)
    })

    it('fails the load when the Draco payload is damaged', async () => {
      // Overwrite the BIN chunk, which holds the Draco streams, past its
      // chunk header.
      const damaged = bytes.slice()
      const jsonLength = new DataView(damaged.buffer).getUint32(12, true)
      damaged.fill(0x7F, 20 + jsonLength + 8)
      await expect(loadGlbInThree(damaged)).rejects.toThrow()
    })
  })

  describe('a native Meshopt export', () => {
    const bytes = read('native-meshopt.glb')

    it('decodes through the Meshopt decoder', async () => {
      const result = await loadGlbInThree(bytes)
      expect(result.triangleCount).toBe(INDEX_IFC_TRIANGLES)
      // The native layout is not named: that is what Portable is for.
      expect(hasNodeChain(result.paths, SPATIAL_CHAIN)).toBe(false)
    })

    it('catches byte-quantized normals that do not declare KHR_mesh_quantization', async () => {
      // What this fixture really is: Share's Meshopt export as of this
      // writing stores NORMAL as normalized BYTE and does not list
      // KHR_mesh_quantization, which glTF only allows WITH that extension.
      // three.js loads it anyway; a strict consumer may not. The validator
      // must say so, or the live 5b spec could never catch it.
      const result = await validateGlb(bytes)
      expect(result.numErrors).toBeGreaterThan(0)
      expect(new Set(result.errors.map((e) => e.code))).toEqual(new Set(['MESH_PRIMITIVE_ATTRIBUTES_ACCESSOR_INVALID_FORMAT']))
      expect(result.errors.every((e) => /\/attributes\/NORMAL$/.test(e.pointer))).toBe(true)
    })
  })

  describe('hasNodeChain', () => {
    const paths = [['Bldrs_1'], ['Bldrs_1', 'Build'], ['Bldrs_1', 'Build', 'Every']]

    it('sees through three.js\'s uniqueness suffix', () => {
      expect(hasNodeChain(paths, ['Bldrs', 'Build', 'Every'])).toBe(true)
    })

    it('wants the names in order, from the root', () => {
      expect(hasNodeChain(paths, ['Build', 'Every'])).toBe(false)
      expect(hasNodeChain(paths, ['Bldrs', 'Every'])).toBe(false)
      expect(hasNodeChain([['mesh_0'], ['mesh_1']], ['Bldrs'])).toBe(false)
    })
  })
})
