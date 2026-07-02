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
// without standing up the wasm encoder pipeline. The schemaVersionFor
// mock reads through to the live `BLDRS_GLB_SCHEMA_VERSION` constant
// (via `jest.requireActual`) so bumping the schema in `glbCacheKey.js`
// doesn't break this mock.
const mockActiveMode = jest.fn(() => null)
const mockCompressGlb = jest.fn((bytes, mode) => Promise.resolve({bytes, mode: mode || null}))
jest.mock('./glbCompress', () => ({
  activeGlbCompressionMode: () => mockActiveMode(),
  schemaVersionFor: (mode) => {
    const {BLDRS_GLB_SCHEMA_VERSION: ver} = jest.requireActual('./glbCacheKey')
    return mode ? `${ver}-${mode}` : ver
  },
  compressGlb: (...args) => mockCompressGlb(...args),
}))

// The worker dispatch fails synchronously in jsdom (no Worker
// constructor), so `exportAndCacheGlb` takes the inline-fallback path
// — calling `injectGlbExtensions` directly. We spy on that to assert
// the writer passed the right `sceneExtras` shape into the consolidated
// inject pass. Real `injectGlbExtensions` is also exported in
// `requireActual` so callers can decide whether to delegate or stub.
const mockInjectGlbExtensions = jest.fn()
jest.mock('./injectGlbExtensions', () => {
  const actual = jest.requireActual('./injectGlbExtensions')
  return {
    ...actual,
    injectGlbExtensions: (...args) => mockInjectGlbExtensions(...args),
  }
})

import {BLDRS_GLB_SCHEMA_VERSION} from './glbCacheKey'
import {BLDRS_TITLE_EXTRAS_KEY, exportAndCacheGlb, exportThreeModelAsGlb} from './glbExport'
import {parseGlb, serializeGlb} from './injectGlbExtensions'
import {gitHubCacheKey} from './sourceCacheKey'


/**
 * Build a minimal-but-spec-valid GLB the inject step can parseGlb.
 * Has the required `asset.version`, a single empty scene, and an empty
 * buffer — enough for the writer's `parseGlb` → mutate → `serializeGlb`
 * round-trip without standing up the real GLTFExporter pipeline.
 *
 * @return {Uint8Array}
 */
function makeValidEmptyGlb() {
  const json = {
    asset: {version: '2.0'},
    scene: 0,
    scenes: [{nodes: []}],
    buffers: [{byteLength: 0}],
  }
  return serializeGlb(json, null)
}


describe('loader/glbExport', () => {
  beforeEach(() => {
    mockWriteGlbBytesToOPFS.mockReset().mockResolvedValue(true)
    mockExporterParse.mockReset()
    mockActiveMode.mockReset().mockReturnValue(null)
    mockCompressGlb.mockReset().mockImplementation((bytes, mode) => Promise.resolve({bytes, mode: mode || null}))
    // Default the inject spy to a passthrough; per-test cases override
    // to capture arguments. The real shape would be `{bytes, stats}`;
    // we return the input bytes so downstream `packGlbChunks` succeeds.
    mockInjectGlbExtensions.mockReset().mockImplementation((bytes) => ({
      bytes,
      stats: {addedExtensions: 0, addedBinBytes: 0, addedSceneExtras: 0, skippedNames: []},
    }))
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

    it('skips a BatchedMesh model (not GLB-cacheable yet) without exporting', async () => {
      const ok = await exportAndCacheGlb({model: {isBatchedMesh: true}, ...ctx})
      expect(ok).toBe(false)
      expect(mockExporterParse).not.toHaveBeenCalled()
      expect(mockWriteGlbBytesToOPFS).not.toHaveBeenCalled()
    })

    it('skips a Group that contains a BatchedMesh', async () => {
      const model = {
        traverse: (fn) => {
          fn({isBatchedMesh: false})
          fn({isBatchedMesh: true})
        },
      }
      const ok = await exportAndCacheGlb({model, ...ctx})
      expect(ok).toBe(false)
      expect(mockWriteGlbBytesToOPFS).not.toHaveBeenCalled()
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
      expect(mockCompressGlb).toHaveBeenCalledWith(
        expect.any(Uint8Array), null, expect.objectContaining({preserveTriangleOrder: expect.any(Boolean)}))
    })
  })


  describe('exportAndCacheGlb — model title stamping (page-title cache-hit fix)', () => {
    const cacheKeyArgs = gitHubCacheKey({
      owner: 'bldrs-ai',
      repo: 'share',
      branch: 'main',
      filePath: 'sub/dir/index.ifc',
      shaHash: 'abc123',
    })
    const ctx = {kindLabel: 'github', cacheKeyArgs}

    it('passes the title to injectGlbExtensions via sceneExtras (no separate parse/serialize pass)', async () => {
      const validGlb = makeValidEmptyGlb()
      mockExporterParse.mockImplementation((_input, onDone) => onDone(validGlb.buffer))

      const ok = await exportAndCacheGlb({model: {name: 'Momentum'}, ...ctx})
      expect(ok).toBe(true)

      // The writer should consolidate the title injection into the
      // existing BLDRS_* inject pass — one parse/serialize, not two.
      expect(mockInjectGlbExtensions).toHaveBeenCalledTimes(1)
      const [, extensionsArg, sceneExtrasArg] = mockInjectGlbExtensions.mock.calls[0]
      expect(Array.isArray(extensionsArg)).toBe(true)
      expect(sceneExtrasArg).toEqual({[BLDRS_TITLE_EXTRAS_KEY]: 'Momentum'})
    })

    it('passes sceneExtras: null when model.name is absent (drag-dropped GLB / OBJ etc.)', async () => {
      const validGlb = makeValidEmptyGlb()
      mockExporterParse.mockImplementation((_input, onDone) => onDone(validGlb.buffer))

      const ok = await exportAndCacheGlb({model: {}, ...ctx})
      expect(ok).toBe(true)

      expect(mockInjectGlbExtensions).toHaveBeenCalledTimes(1)
      const [, , sceneExtrasArg] = mockInjectGlbExtensions.mock.calls[0]
      expect(sceneExtrasArg).toBeNull()
    })

    it('passes sceneExtras: null when model.name is the empty string', async () => {
      const validGlb = makeValidEmptyGlb()
      mockExporterParse.mockImplementation((_input, onDone) => onDone(validGlb.buffer))

      const ok = await exportAndCacheGlb({model: {name: ''}, ...ctx})
      expect(ok).toBe(true)

      expect(mockInjectGlbExtensions).toHaveBeenCalledTimes(1)
      const [, , sceneExtrasArg] = mockInjectGlbExtensions.mock.calls[0]
      expect(sceneExtrasArg).toBeNull()
    })

    it('passes sceneExtras: null when model.name is non-string', async () => {
      // Defensive: `Object3D.name` defaults to '' but a hostile caller
      // could pass anything. The writer should coerce non-string to
      // null rather than serialize garbage into scenes[0].extras.
      const validGlb = makeValidEmptyGlb()
      mockExporterParse.mockImplementation((_input, onDone) => onDone(validGlb.buffer))

      const ok = await exportAndCacheGlb({model: {name: 42}, ...ctx})
      expect(ok).toBe(true)

      const [, , sceneExtrasArg] = mockInjectGlbExtensions.mock.calls[0]
      expect(sceneExtrasArg).toBeNull()
    })

    it('end-to-end: title round-trips through injectGlbExtensions into scenes[0].extras', async () => {
      // Integration test: run with the REAL injectGlbExtensions (no
      // mock) so we verify the consolidated pass actually writes the
      // title to scenes[0].extras. The mock spy default would swallow
      // sceneExtras silently, hiding writer bugs.
      const actual = jest.requireActual('./injectGlbExtensions')
      mockInjectGlbExtensions.mockImplementation(actual.injectGlbExtensions)

      const validGlb = makeValidEmptyGlb()
      mockExporterParse.mockImplementation((_input, onDone) => onDone(validGlb.buffer))

      const ok = await exportAndCacheGlb({model: {name: 'Momentum'}, ...ctx})
      expect(ok).toBe(true)

      // The injected bytes (returned from `injectGlbExtensions` to the
      // writer) carry the title. Grab them from the mock's return value.
      const injectResult = mockInjectGlbExtensions.mock.results[0].value
      const {json} = parseGlb(injectResult.bytes)
      expect(json.scenes[0].extras[BLDRS_TITLE_EXTRAS_KEY]).toBe('Momentum')
      expect(injectResult.stats.addedSceneExtras).toBe(1)
    })
  })
})
