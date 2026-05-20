// Tests for the GLB writer (post-2a switch to GLTFExporter). The
// exporter and OPFS are mocked so these are unit tests of the wiring +
// container packing, not an integration test of an actual scene→GLB
// conversion.

const mockWriteGlbBytesToOPFS = jest.fn()
jest.mock('../OPFS/utils', () => ({
  writeGlbBytesToOPFS: (...args) => mockWriteGlbBytesToOPFS(...args),
}))

const mockExporterParse = jest.fn()
jest.mock('three/examples/jsm/exporters/GLTFExporter.js', () => ({
  GLTFExporter: jest.fn().mockImplementation(() => ({
    parse: (...args) => mockExporterParse(...args),
  })),
}))

// The real glbCompress lazy-imports @gltf-transform; in unit tests we
// short-circuit it to a passthrough so the writer's behavior is testable
// without standing up the wasm encoder pipeline.
const mockActiveMode = jest.fn(() => null)
const mockCompressGlb = jest.fn((bytes, mode) => Promise.resolve({bytes, mode: mode || null}))
jest.mock('./glbCompress', () => ({
  activeGlbCompressionMode: () => mockActiveMode(),
  schemaVersionFor: (mode) => (mode ? `0.5.0-${mode}` : '0.5.0'),
  compressGlb: (...args) => mockCompressGlb(...args),
}))

import {BLDRS_GLB_SCHEMA_VERSION} from './glbCacheKey'
import {exportAndCacheGlb, exportThreeModelAsGlb} from './glbExport'
import {gitHubCacheKey} from './sourceCacheKey'


describe('loader/glbExport', () => {
  beforeEach(() => {
    mockWriteGlbBytesToOPFS.mockReset().mockResolvedValue(true)
    mockExporterParse.mockReset()
    mockActiveMode.mockReset().mockReturnValue(null)
    mockCompressGlb.mockReset().mockImplementation((bytes, mode) => Promise.resolve({bytes, mode: mode || null}))
  })

  describe('exportThreeModelAsGlb', () => {
    it('returns a Uint8Array when GLTFExporter resolves with an ArrayBuffer', async () => {
      mockExporterParse.mockImplementation((_input, onDone) => {
        onDone(new Uint8Array([0x67, 0x6c, 0x54, 0x46, 1, 2]).buffer) // eslint-disable-line no-magic-numbers
      })
      const out = await exportThreeModelAsGlb({fake: 'model'})
      expect(out).toBeInstanceOf(Uint8Array)
      expect(Array.from(out.subarray(0, 4))).toEqual([0x67, 0x6c, 0x54, 0x46]) // eslint-disable-line no-magic-numbers
    })

    it('resolves to null when GLTFExporter returns non-binary', async () => {
      mockExporterParse.mockImplementation((_input, onDone) => {
        onDone({asset: {version: '2.0'}})
      })
      expect(await exportThreeModelAsGlb({})).toBeNull()
    })

    it('resolves to null when GLTFExporter calls onError', async () => {
      mockExporterParse.mockImplementation((_input, _onDone, onError) => {
        onError(new Error('boom'))
      })
      expect(await exportThreeModelAsGlb({})).toBeNull()
    })

    it('resolves to null when GLTFExporter throws synchronously', async () => {
      mockExporterParse.mockImplementation(() => {
        throw new Error('sync boom')
      })
      expect(await exportThreeModelAsGlb({})).toBeNull()
    })
  })

  describe('exportAndCacheGlb (T-1: writer/reader cache-key parity)', () => {
    const cacheKeyArgs = gitHubCacheKey({
      owner: 'bldrs-ai',
      repo: 'share',
      branch: 'main',
      filePath: 'sub/dir/index.ifc',
      shaHash: 'abc123',
    })
    const ctx = {kindLabel: 'github', cacheKeyArgs}
    // eslint-disable-next-line no-magic-numbers
    const fakeGlbBytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 1, 2, 3])

    it('writes the container to OPFS at exactly the cache key the reader looks up', async () => {
      mockExporterParse.mockImplementation((_input, onDone) => onDone(fakeGlbBytes.buffer))

      const ok = await exportAndCacheGlb({model: {fake: 'model'}, ...ctx})
      expect(ok).toBe(true)

      expect(mockWriteGlbBytesToOPFS).toHaveBeenCalledTimes(1)
      const [bytes, originalFilePath, commitHash, owner, repo, branch] =
        mockWriteGlbBytesToOPFS.mock.calls[0]
      expect(bytes).toBeInstanceOf(Uint8Array)
      // Bldrs container header: "BLDR" magic.
      const BLDR_MAGIC = [0x42, 0x4c, 0x44, 0x52] // eslint-disable-line no-magic-numbers
      expect(Array.from(bytes.subarray(0, 4))).toEqual(BLDR_MAGIC)
      // Reader derives the same path from glbCacheKey({sourcePath: filePath, schemaVer: default}).
      expect(originalFilePath).toBe(`sub/dir/index.${BLDRS_GLB_SCHEMA_VERSION}.glb`)
      expect(commitHash).toBe('abc123')
      expect(owner).toBe('bldrs-ai')
      expect(repo).toBe('share')
      expect(branch).toBe('main')
    })

    it('returns false (no throw) when the exporter produces no bytes', async () => {
      mockExporterParse.mockImplementation((_input, _onDone, onError) => onError(new Error('nope')))
      const ok = await exportAndCacheGlb({model: {}, ...ctx})
      expect(ok).toBe(false)
      expect(mockWriteGlbBytesToOPFS).not.toHaveBeenCalled()
    })

    it('returns false (no throw) when OPFS write fails', async () => {
      mockExporterParse.mockImplementation((_input, onDone) => onDone(fakeGlbBytes.buffer))
      mockWriteGlbBytesToOPFS.mockRejectedValueOnce(new Error('disk quota'))

      const ok = await exportAndCacheGlb({model: {}, ...ctx})
      expect(ok).toBe(false)
    })

    it('passes the exported bytes through compressGlb with the active mode', async () => {
      mockExporterParse.mockImplementation((_input, onDone) => onDone(fakeGlbBytes.buffer))
      mockActiveMode.mockReturnValue('draco')

      const ok = await exportAndCacheGlb({model: {}, ...ctx})
      expect(ok).toBe(true)
      expect(mockCompressGlb).toHaveBeenCalledTimes(1)
      const [bytes, mode] = mockCompressGlb.mock.calls[0]
      expect(bytes).toBeInstanceOf(Uint8Array)
      expect(mode).toBe('draco')
    })

    it('still calls compressGlb (with null mode) when no flag is on', async () => {
      mockExporterParse.mockImplementation((_input, onDone) => onDone(fakeGlbBytes.buffer))

      const ok = await exportAndCacheGlb({model: {}, ...ctx})
      expect(ok).toBe(true)
      expect(mockCompressGlb).toHaveBeenCalledWith(expect.any(Uint8Array), null)
    })
  })
})
