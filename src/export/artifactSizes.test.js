import {captureException} from '@sentry/react'
import {packGlbChunks} from '../loader/glbContainer'
import {serializeGlb} from '../loader/injectGlbExtensions'
import {readModelByPathFromOPFS} from '../OPFS/utils'
import {artifactSizes} from './artifactSizes'


jest.mock('../OPFS/utils', () => ({readModelByPathFromOPFS: jest.fn()}))
jest.mock('@sentry/react', () => ({captureException: jest.fn()}))


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
})
