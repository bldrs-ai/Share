import {captureException} from '@sentry/react'
import {packGlbChunks} from '../loader/glbContainer'
import {serializeGlb} from '../loader/injectGlbExtensions'
import {readModelByPathFromOPFS} from '../OPFS/utils'
import {artifactSizes, compressedExport} from './artifactSizes'
import {compressExportGlb} from './glbCompression'


jest.mock('../OPFS/utils', () => ({readModelByPathFromOPFS: jest.fn()}))
jest.mock('@sentry/react', () => ({captureException: jest.fn()}))
// The codecs have their own suite against the real encoders
// (glbCompression.test.js); here the module stands in for "an encode
// happened", so this suite stays off two wasm builds and can assert on how
// often it is asked to run.
jest.mock('./glbCompression', () => ({
  ...jest.requireActual('./glbCompression'),
  compressExportGlb: jest.fn(),
}))


/* eslint-disable no-magic-numbers */
const BIN = new Uint8Array(16).fill(7)
const ARTIFACT = {
  cacheKeyArgs: {
    ns1: 'gh-bldrs-ai',
    ns2: 'test-models',
    ns3: 'main',
    sourcePath: 'ifc/misc/box.ifc',
    sourceHash: 'sha123',
  },
  schemaVer: '0.21.0-batched',
  writtenAt: 1,
}


/**
 * A cached artifact carrying one Bldrs payload in a view of its own.
 *
 * A `Blob` rather than a `File`: jsdom's File has no `arrayBuffer()` on what
 * `slice()` returns, and only `size`/`slice`/`arrayBuffer` are used.
 *
 * @return {Blob}
 */
function cachedArtifact() {
  const glb = serializeGlb({
    asset: {version: '2.0'},
    extensionsUsed: ['BLDRS_spatial_tree'],
    extensions: {BLDRS_spatial_tree: {compressed: true, bufferView: 1}},
    accessors: [{bufferView: 0, componentType: 5121, count: 8, type: 'SCALAR'}],
    buffers: [{byteLength: BIN.byteLength}],
    bufferViews: [
      {buffer: 0, byteOffset: 0, byteLength: 8},
      {buffer: 0, byteOffset: 8, byteLength: 8},
    ],
  }, BIN)
  return new Blob([packGlbChunks([glb])])
}


describe('artifactSizes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('sizes the artifact the store slot points at', async () => {
    readModelByPathFromOPFS.mockResolvedValue(cachedArtifact())

    const sizes = await artifactSizes({...ARTIFACT})

    expect(sizes.withMetadata).toBeGreaterThan(sizes.withoutMetadata)
    expect(sizes.metadataBytes).toBe(sizes.withMetadata - sizes.withoutMetadata)
    // The same OPFS coordinates the export itself reads (useExport.js), so
    // the panel and the download can't be sizing different files.
    expect(readModelByPathFromOPFS).toHaveBeenCalledWith(
      'ifc/misc/box.0.21.0-batched.glb', 'sha123', 'gh-bldrs-ai', 'test-models', 'main')
  })

  it('reads each artifact once, however often the tab is reopened', async () => {
    readModelByPathFromOPFS.mockResolvedValue(cachedArtifact())
    const artifact = {...ARTIFACT}

    const first = await artifactSizes(artifact)
    const second = await artifactSizes(artifact)

    expect(second).toBe(first)
    expect(readModelByPathFromOPFS).toHaveBeenCalledTimes(1)
  })

  it('re-reads when the loader publishes a new artifact', async () => {
    readModelByPathFromOPFS.mockResolvedValue(cachedArtifact())

    await artifactSizes({...ARTIFACT})
    await artifactSizes({...ARTIFACT, writtenAt: 2})

    expect(readModelByPathFromOPFS).toHaveBeenCalledTimes(2)
  })

  it('has no sizes to give before the loader publishes one', async () => {
    expect(await artifactSizes(null)).toBeNull()
    expect(readModelByPathFromOPFS).not.toHaveBeenCalled()
  })

  it('says nothing rather than failing when the artifact was evicted', async () => {
    // Clear Local Cache between the publish and the tab opening. The export
    // reports this when the user clicks; an unprompted second telling is
    // noise, and it is not an error worth a Sentry event either.
    readModelByPathFromOPFS.mockResolvedValue(null)

    expect(await artifactSizes({...ARTIFACT})).toBeNull()
    expect(captureException).not.toHaveBeenCalled()
  })

  it('reports a malformed artifact and still shows no size', async () => {
    // A header the size read can't parse is a header the EXPORT can't parse
    // either, so this one is worth seeing.
    readModelByPathFromOPFS.mockResolvedValue(new Blob([new Uint8Array(64)]))

    expect(await artifactSizes({...ARTIFACT})).toBeNull()
    expect(captureException).toHaveBeenCalledTimes(1)
  })

  describe('with a codec chosen', () => {
    const COMPRESSED = {
      withMetadata: new Uint8Array(300),
      withoutMetadata: new Uint8Array(120),
      strippedExtensions: ['BLDRS_spatial_tree'],
      mode: 'meshopt',
    }

    beforeEach(() => {
      readModelByPathFromOPFS.mockResolvedValue(cachedArtifact())
      compressExportGlb.mockResolvedValue(COMPRESSED)
    })

    it('measures the compressed file rather than estimating it', async () => {
      // There is no honest shortcut: the size of a Meshopt or Draco file is a
      // property of the encoder. Both figures are byte lengths of bytes that
      // exist (#1842).
      const sizes = await artifactSizes({...ARTIFACT}, 'meshopt')

      expect(sizes).toEqual({withMetadata: 300, withoutMetadata: 120, metadataBytes: 180})
      expect(compressExportGlb).toHaveBeenCalledWith(expect.any(Uint8Array), 'meshopt')
    })

    it('encodes once per artifact and codec, and the export gets those bytes', async () => {
      // The whole reason the number on the size line is the number that lands
      // in Downloads: the panel's estimate and the export's payload are one
      // cache entry, not two computations that are supposed to agree.
      const artifact = {...ARTIFACT}

      const quoted = await artifactSizes(artifact, 'meshopt')
      const forDownload = await compressedExport(artifact, 'meshopt')

      expect(forDownload).toBe(COMPRESSED)
      expect(compressExportGlb).toHaveBeenCalledTimes(1)
      // The figure on the line is the length of the bytes the export gets —
      // one entry read twice, not two computations that are supposed to agree.
      expect(quoted.withMetadata).toBe(forDownload.withMetadata.byteLength)
      expect(quoted.withoutMetadata).toBe(forDownload.withoutMetadata.byteLength)
    })

    it('encodes again for a different codec', async () => {
      const artifact = {...ARTIFACT}

      await artifactSizes(artifact, 'meshopt')
      await artifactSizes(artifact, 'draco')

      expect(compressExportGlb).toHaveBeenCalledTimes(2)
      expect(compressExportGlb).toHaveBeenLastCalledWith(expect.any(Uint8Array), 'draco')
    })

    it('uses the bytes the caller already has rather than re-reading OPFS', async () => {
      // The export has just read the artifact to hand it to the pro module;
      // reading a hundreds-of-MB file a second time to compress it would be
      // the panel's cost paid twice.
      const glb = new Uint8Array([1, 2, 3, 4])

      await compressedExport({...ARTIFACT}, 'draco', glb)

      expect(readModelByPathFromOPFS).not.toHaveBeenCalled()
      expect(compressExportGlb).toHaveBeenCalledWith(glb, 'draco')
    })

    it('reports a failed encode and shows no size', async () => {
      compressExportGlb.mockRejectedValue(new Error('encoder unavailable'))

      expect(await artifactSizes({...ARTIFACT}, 'draco')).toBeNull()
      expect(captureException).toHaveBeenCalledTimes(1)
    })
  })
})
