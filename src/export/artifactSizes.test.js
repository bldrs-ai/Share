import {
  CompressionStream as NodeCompressionStream,
  DecompressionStream as NodeDecompressionStream,
} from 'node:stream/web'
import {captureException} from '@sentry/react'
import {packGlbChunks} from '../loader/glbContainer'
import {serializeGlb} from '../loader/injectGlbExtensions'
import {readModelByPathFromOPFS} from '../OPFS/utils'
import {
  artifactPositionRange,
  artifactSizes,
  compressedExport,
  gzippedExport,
  releaseCompressedExport,
  retainOnlyCompressedExports,
} from './artifactSizes'
import {compressExportGlb} from './glbCompression'
import {rewriteGlbPortable} from './glbPortable'


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
// Same reasoning for the portable rewrite: it has its own suite against real
// artifact bytes (glbPortable.test.js). Mocked here so this one can assert the
// ORDER — that what reaches the codec is what the rewrite produced.
jest.mock('./glbPortable', () => ({rewriteGlbPortable: jest.fn()}))


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
 * @return {Promise<Blob>}
 */
async function cachedArtifact() {
  return new Blob([await packGlbChunks([cachedGlb()])])
}


/**
 * The artifact's chunk 0 on its own — a standalone GLB with one Bldrs payload,
 * so a strip of it really removes something.
 *
 * @return {Uint8Array}
 */
function cachedGlb() {
  return serializeGlb({
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
}


describe('artifactSizes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('sizes the artifact the store slot points at', async () => {
    readModelByPathFromOPFS.mockResolvedValue(await cachedArtifact())

    const sizes = await artifactSizes({...ARTIFACT})

    expect(sizes.withMetadata).toBeGreaterThan(sizes.withoutMetadata)
    expect(sizes.metadataBytes).toBe(sizes.withMetadata - sizes.withoutMetadata)
    expect(sizes.compression).toBe('none')
    // The same OPFS coordinates the export itself reads (useExport.js), so
    // the panel and the download can't be sizing different files.
    expect(readModelByPathFromOPFS).toHaveBeenCalledWith(
      'ifc/misc/box.0.21.0-batched.glb', 'sha123', 'gh-bldrs-ai', 'test-models', 'main')
  })

  it('reads each artifact once, however often the tab is reopened', async () => {
    readModelByPathFromOPFS.mockResolvedValue(await cachedArtifact())
    const artifact = {...ARTIFACT}

    const first = await artifactSizes(artifact)
    const second = await artifactSizes(artifact)

    expect(second).toBe(first)
    expect(readModelByPathFromOPFS).toHaveBeenCalledTimes(1)
  })

  it('re-reads when the loader publishes a new artifact', async () => {
    readModelByPathFromOPFS.mockResolvedValue(await cachedArtifact())

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

    beforeEach(async () => {
      readModelByPathFromOPFS.mockResolvedValue(await cachedArtifact())
      compressExportGlb.mockResolvedValue(COMPRESSED)
    })

    it('measures the compressed file rather than estimating it', async () => {
      // There is no honest shortcut: the size of a Meshopt or Draco file is a
      // property of the encoder. Both figures are byte lengths of bytes that
      // exist (#1842).
      const sizes = await artifactSizes({...ARTIFACT}, 'meshopt')

      expect(sizes).toEqual({withMetadata: 300, withoutMetadata: 120, metadataBytes: 180, compression: 'meshopt'})
      expect(compressExportGlb).toHaveBeenCalledWith(expect.any(Uint8Array), 'meshopt', 'balanced')
    })

    it('says which codec the figure is for, which is none when the encoder fell back', async () => {
      // `compressExportGlb` hands back the uncompressed file when its encoder
      // is unavailable; the panel needs to know the Draco figure it asked
      // for is not one (ExportSection.jsx).
      compressExportGlb.mockResolvedValue({...COMPRESSED, mode: 'none'})

      const sizes = await artifactSizes({...ARTIFACT}, 'draco')

      expect(sizes.compression).toBe('none')
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
      expect(compressExportGlb).toHaveBeenLastCalledWith(expect.any(Uint8Array), 'draco', 'balanced')
    })

    it('uses the bytes the caller already has rather than re-reading OPFS', async () => {
      // The export has just read the artifact to hand it to the pro module;
      // reading a hundreds-of-MB file a second time to compress it would be
      // the panel's cost paid twice.
      const glb = new Uint8Array([1, 2, 3, 4])

      await compressedExport({...ARTIFACT}, 'draco', glb)

      expect(readModelByPathFromOPFS).not.toHaveBeenCalled()
      expect(compressExportGlb).toHaveBeenCalledWith(glb, 'draco', 'balanced')
    })

    it('reports a failed encode and shows no size', async () => {
      compressExportGlb.mockRejectedValue(new Error('encoder unavailable'))

      expect(await artifactSizes({...ARTIFACT}, 'draco')).toBeNull()
      expect(captureException).toHaveBeenCalledTimes(1)
    })
  })

  describe('with Portable on (#1843)', () => {
    // A real GLB, not a byte blob: the portable-without-codec path strips it
    // for the metadata-off side, and a strip needs something to parse.
    const PORTABLE_BYTES = cachedGlb()

    beforeEach(async () => {
      readModelByPathFromOPFS.mockResolvedValue(await cachedArtifact())
      rewriteGlbPortable.mockReturnValue({bytes: PORTABLE_BYTES, isChanged: true, stats: {}})
    })

    it('reads the whole artifact even with no codec, because the rewrite must', async () => {
      // The uncompressed estimate is otherwise a header read that never
      // touches the BIN chunk — and the rewrite reads instance TRS floats and
      // ungzips two payloads out of exactly that chunk. So Portable + None is
      // not free, and the panel shows "Estimating…" for it.
      const sizes = await artifactSizes({...ARTIFACT}, 'none', true)

      expect(rewriteGlbPortable).toHaveBeenCalledWith(expect.any(Uint8Array))
      // No codec ran, but the metadata toggle still has two sides: the strip
      // that the pro module would have done is done here, because the module
      // runs none of its own once a hook is in play.
      expect(compressExportGlb).not.toHaveBeenCalled()
      expect(sizes.compression).toBe('none')
      expect(sizes.withMetadata).toBe(PORTABLE_BYTES.byteLength)
      expect(sizes.withoutMetadata).toBeLessThan(sizes.withMetadata)
    })

    it('rewrites BEFORE the codec, never after', async () => {
      // Order is load-bearing: after Meshopt a bufferView addresses decoded
      // bytes on a fallback buffer the file does not carry, and after Draco
      // the instance TRS floats are not floats — the rewrite would read
      // rubbish either way.
      compressExportGlb.mockResolvedValue({
        withMetadata: new Uint8Array(300),
        withoutMetadata: new Uint8Array(120),
        strippedExtensions: [],
        mode: 'meshopt',
      })

      await artifactSizes({...ARTIFACT}, 'meshopt', true)

      expect(compressExportGlb).toHaveBeenCalledWith(PORTABLE_BYTES, 'meshopt', 'balanced')
    })

    it('keeps portable and native apart in the cache at the same codec', async () => {
      // They are different FILES. A shared cell would quote one and hand the
      // export the other.
      compressExportGlb.mockResolvedValue({
        withMetadata: new Uint8Array(300),
        withoutMetadata: new Uint8Array(120),
        strippedExtensions: [],
        mode: 'meshopt',
      })
      const artifact = {...ARTIFACT}

      await artifactSizes(artifact, 'meshopt', false)
      await artifactSizes(artifact, 'meshopt', true)
      await artifactSizes(artifact, 'meshopt', true)

      expect(compressExportGlb).toHaveBeenCalledTimes(2)
      expect(rewriteGlbPortable).toHaveBeenCalledTimes(1)
    })

    it('leaves the native uncompressed estimate on its cheap header read', async () => {
      await artifactSizes({...ARTIFACT}, 'none', false)

      expect(rewriteGlbPortable).not.toHaveBeenCalled()
    })
  })

  describe('with a Quality rung chosen (#1848)', () => {
    const COMPRESSED = {
      withMetadata: new Uint8Array(300),
      withoutMetadata: new Uint8Array(120),
      strippedExtensions: [],
      mode: 'draco',
    }

    beforeEach(async () => {
      readModelByPathFromOPFS.mockResolvedValue(await cachedArtifact())
      compressExportGlb.mockResolvedValue(COMPRESSED)
    })

    it('carries the rung to the encoder, defaulting to Balanced', async () => {
      await artifactSizes({...ARTIFACT}, 'draco', false, 'smallest')
      expect(compressExportGlb).toHaveBeenLastCalledWith(expect.any(Uint8Array), 'draco', 'smallest')

      await artifactSizes({...ARTIFACT}, 'draco')
      expect(compressExportGlb).toHaveBeenLastCalledWith(expect.any(Uint8Array), 'draco', 'balanced')
    })

    it('keeps two rungs apart in the cache at the same codec', async () => {
      // They are different FILES — different POSITION bits, different encoder
      // settings — so a shared cell would quote one and hand the export the
      // other, which is the exact failure the portable/native split closed.
      const artifact = {...ARTIFACT}

      await artifactSizes(artifact, 'draco', false, 'best')
      await artifactSizes(artifact, 'draco', false, 'smallest')
      await artifactSizes(artifact, 'draco', false, 'smallest')

      expect(compressExportGlb).toHaveBeenCalledTimes(2)
    })

    it('does not split the uncompressed cell, where no encoder runs', async () => {
      // Quality is an encoder setting and nothing else reads it. Folding it
      // into the key unconditionally would read the header three times for
      // one number — and with Portable on, run the whole artifact rewrite
      // once per rung for three identical files.
      const artifact = {...ARTIFACT}

      await artifactSizes(artifact, 'none', false, 'best')
      await artifactSizes(artifact, 'none', false, 'smallest')

      expect(readModelByPathFromOPFS).toHaveBeenCalledTimes(1)
    })

    it('does not split the portable-without-codec cell either', async () => {
      rewriteGlbPortable.mockReturnValue({bytes: cachedGlb(), isChanged: true, stats: {}})
      const artifact = {...ARTIFACT}

      await artifactSizes(artifact, 'none', true, 'best')
      await artifactSizes(artifact, 'none', true, 'smallest')

      expect(rewriteGlbPortable).toHaveBeenCalledTimes(1)
      expect(compressExportGlb).not.toHaveBeenCalled()
    })
  })

  describe('releasing a measured codec (#1850)', () => {
    const COMPRESSED = {
      withMetadata: new Uint8Array(300),
      withoutMetadata: new Uint8Array(120),
      strippedExtensions: [],
      mode: 'draco',
    }

    beforeEach(async () => {
      readModelByPathFromOPFS.mockResolvedValue(await cachedArtifact())
      compressExportGlb.mockResolvedValue(COMPRESSED)
    })

    it('drops the bytes of exactly the cell it names', async () => {
      // The background sweep measures every codec, and each cell holds two
      // whole copies of the export. Without a release, opening the tab would
      // leave three codecs' worth resident beside the source.
      const artifact = {...ARTIFACT}
      await artifactSizes(artifact, 'draco', false, 'best')
      await artifactSizes(artifact, 'meshopt', false, 'best')
      expect(compressExportGlb).toHaveBeenCalledTimes(2)

      releaseCompressedExport(artifact, 'draco', false, 'best')

      // Draco has to be encoded again; Meshopt is still in hand.
      await artifactSizes(artifact, 'meshopt', false, 'best')
      expect(compressExportGlb).toHaveBeenCalledTimes(2)
      await artifactSizes(artifact, 'draco', false, 'best')
      expect(compressExportGlb).toHaveBeenCalledTimes(3)
    })

    it('is harmless on an artifact that never had a cell', () => {
      // The sweep releases whatever it measured, including a codec whose
      // encode failed and left nothing behind.
      expect(() => releaseCompressedExport({...ARTIFACT}, 'draco')).not.toThrow()
    })
  })

  describe('reconciling what stays resident (#1852 review)', () => {
    const COMPRESSED = {
      withMetadata: new Uint8Array(300),
      withoutMetadata: new Uint8Array(120),
      strippedExtensions: [],
      mode: 'draco',
    }

    beforeEach(async () => {
      readModelByPathFromOPFS.mockResolvedValue(await cachedArtifact())
      compressExportGlb.mockResolvedValue(COMPRESSED)
      rewriteGlbPortable.mockReturnValue({bytes: cachedGlb(), isChanged: true, stats: {}})
    })

    it('keeps the cells it is given and drops the rest, whatever axis they differ on', async () => {
      // The whole retention policy in one statement. It replaces a per-rung
      // eviction that had to enumerate the codec × Portable product and know
      // which keys carry a rung at all: here the inner map is walked, so a
      // cell left over from any axis — another rung, the other Portable
      // setting, a codec nobody selected — goes because it was not named.
      const artifact = {...ARTIFACT}
      for (const isPortable of [false, true]) {
        for (const quality of ['best', 'smallest']) {
          await artifactSizes(artifact, 'draco', isPortable, quality)
        }
      }
      // Portable-with-no-codec carries no rung in its key at all, and is a
      // rewrite rather than an encode — the cell the rung-shaped eviction had
      // to be told to leave alone.
      await artifactSizes(artifact, 'none', true, 'best')
      expect(compressExportGlb).toHaveBeenCalledTimes(4)
      expect(rewriteGlbPortable).toHaveBeenCalledTimes(3)

      retainOnlyCompressedExports(artifact, [{mode: 'draco', isPortable: false, quality: 'best'}])

      await artifactSizes(artifact, 'draco', false, 'best')
      expect(compressExportGlb).toHaveBeenCalledTimes(4)
      await artifactSizes(artifact, 'draco', false, 'smallest')
      await artifactSizes(artifact, 'draco', true, 'best')
      await artifactSizes(artifact, 'draco', true, 'smallest')
      expect(compressExportGlb).toHaveBeenCalledTimes(7)
      await artifactSizes(artifact, 'none', true, 'best')
      expect(rewriteGlbPortable).toHaveBeenCalledTimes(6)
    })

    it('keeps nothing when given nothing, which is the panel going away', async () => {
      // Nothing outside the Export tab reads an estimate cell — reopening it
      // re-runs the whole codec axis — so a cell held past unmount is two
      // copies of the model on an artifact the store keeps for the session.
      const artifact = {...ARTIFACT}
      await artifactSizes(artifact, 'draco', false, 'best')
      expect(compressExportGlb).toHaveBeenCalledTimes(1)

      retainOnlyCompressedExports(artifact, [])

      await artifactSizes(artifact, 'draco', false, 'best')
      expect(compressExportGlb).toHaveBeenCalledTimes(2)
    })

    it('says the same thing twice without taking anything the second time', async () => {
      // The property the claim-and-release design could not have, and the
      // reason this is a reconcile: a superseded sweep finishing late makes
      // the panel state the same set again, and stating it again has to be a
      // no-op rather than a second release of a cell that is being displayed.
      const artifact = {...ARTIFACT}
      await artifactSizes(artifact, 'draco', false, 'best')
      const keep = [{mode: 'draco', isPortable: false, quality: 'best'}]

      retainOnlyCompressedExports(artifact, keep)
      retainOnlyCompressedExports(artifact, keep)

      await artifactSizes(artifact, 'draco', false, 'best')
      expect(compressExportGlb).toHaveBeenCalledTimes(1)
    })

    it('leaves the header read alone — two numbers, not a copy of the file', async () => {
      // Only the BYTES cache is reconciled. The uncompressed sizes are kept
      // for as long as the artifact is, so reopening the tab on the same
      // model does not go back to OPFS for them (module doc).
      const artifact = {...ARTIFACT}
      await artifactSizes(artifact)
      await artifactSizes(artifact, 'draco', false, 'best')
      readModelByPathFromOPFS.mockClear()

      retainOnlyCompressedExports(artifact, [])

      await artifactSizes(artifact)
      expect(readModelByPathFromOPFS).not.toHaveBeenCalled()
      // …and the compressed cell really did go, or the line above proves
      // nothing about which map was spared.
      await artifactSizes(artifact, 'draco', false, 'best')
      expect(readModelByPathFromOPFS).toHaveBeenCalledTimes(1)
    })

    it('is harmless on an artifact that never had a cell', () => {
      expect(() => retainOnlyCompressedExports({...ARTIFACT}, [])).not.toThrow()
      expect(() => retainOnlyCompressedExports(
        null, [{mode: 'draco', isPortable: false, quality: 'best'}])).not.toThrow()
    })
  })

  describe('with the download gzipped (#1854)', () => {
    // The real `CompressionStream`, planted the way `glbGzip.test.js` plants
    // it: the figures this describes are byte lengths of an actual gzip
    // member, so a stub returning a made-up number would test nothing about
    // the invariant that the displayed size IS the downloaded size.
    //
    // Compressible bytes, deliberately: the codec mock hands back
    // `Uint8Array(300)` of zeros, which gzips to ~30 B, so "gzip moved the
    // figure" is unmistakable rather than a rounding difference.
    const COMPRESSED = {
      withMetadata: new Uint8Array(300),
      withoutMetadata: new Uint8Array(120),
      strippedExtensions: ['BLDRS_spatial_tree'],
      mode: 'meshopt',
    }

    beforeEach(async () => {
      // Both streams, not just the compressor: with `CompressionStream`
      // present the container writes a gzipped v3 artifact (#1855), and
      // reading one back needs the decompressor. No engine ever shipped one
      // without the other, so planting only half would be a fixture the
      // browser cannot produce.
      global.CompressionStream = NodeCompressionStream
      global.DecompressionStream = NodeDecompressionStream
      readModelByPathFromOPFS.mockResolvedValue(await cachedArtifact())
      compressExportGlb.mockResolvedValue(COMPRESSED)
    })

    afterEach(() => {
      delete global.CompressionStream
      delete global.DecompressionStream
    })

    it('reports the gzipped lengths, which is what the browser saves', async () => {
      const raw = await artifactSizes({...ARTIFACT}, 'meshopt')
      const gzipped = await artifactSizes({...ARTIFACT}, 'meshopt', false, 'balanced', true)

      expect(gzipped.withMetadata).toBeLessThan(raw.withMetadata)
      expect(gzipped.withoutMetadata).toBeLessThan(raw.withoutMetadata)
      // Both sides, from one run, because the metadata toggle is not a
      // re-estimate axis anywhere else in this panel and gzip must not make
      // it one.
      expect(gzipped.metadataBytes).toBe(gzipped.withMetadata - gzipped.withoutMetadata)
      expect(gzipped.compression).toBe('meshopt')
    })

    it('runs the whole-file path at codec none, which the header read cannot', async () => {
      // The one selection that was free — native, no codec — stops being
      // free: there is nothing to gzip without the file. The panel's
      // "Estimating…" hangs off exactly this (`ExportSection.jsx`).
      const plain = await artifactSizes({...ARTIFACT}, 'none', false, 'balanced', false)
      expect(compressExportGlb).not.toHaveBeenCalled()

      const gzipped = await artifactSizes({...ARTIFACT}, 'none', false, 'balanced', true)

      expect(gzipped.withMetadata).toBeLessThan(plain.withMetadata)
      expect(gzipped.withMetadata).toBeGreaterThan(0)
    })

    it('adds no axis to the cache that holds the file, and gzips once', async () => {
      // The #1852 review's finding, honoured rather than repeated: the key
      // space was already the problem, so gzip caches two INTEGERS under the
      // SAME key and never a third copy of the export. Asking for both
      // shapes therefore runs the encoder once, and asking twice for the
      // gzipped one re-gzips nothing.
      const artifact = {...ARTIFACT}

      await artifactSizes(artifact, 'meshopt', false, 'balanced', false)
      const first = await artifactSizes(artifact, 'meshopt', false, 'balanced', true)
      const second = await artifactSizes(artifact, 'meshopt', false, 'balanced', true)

      expect(compressExportGlb).toHaveBeenCalledTimes(1)
      expect(second).toBe(first)
    })

    it('hands the export gzipped bytes whose length is the figure it quoted', async () => {
      // The panel's whole contract, at the seam where it could break: the
      // figure came from the measuring gzip and the bytes from a second one,
      // so this is where non-determinism would show up as a file that does
      // not weigh what the user was told.
      const artifact = {...ARTIFACT}
      const quoted = await artifactSizes(artifact, 'meshopt', false, 'balanced', true)

      const forDownload = await gzippedExport(artifact, 'meshopt', null, false, 'balanced', false)

      expect(forDownload.bytes.byteLength).toBe(quoted.withMetadata)
      expect(forDownload.withMetadataBytes).toBe(quoted.withMetadata)
      expect(forDownload.withoutMetadataBytes).toBe(quoted.withoutMetadata)
      // …and the other side of the toggle is the other figure, not the same
      // bytes under a different name.
      const stripped = await gzippedExport(artifact, 'meshopt', null, false, 'balanced', true)
      expect(stripped.bytes.byteLength).toBe(quoted.withoutMetadata)
      expect(stripped.strippedExtensions).toEqual(['BLDRS_spatial_tree'])
      expect(stripped.mode).toBe('meshopt')
    })

    it('has nothing to hand over when the encode failed', async () => {
      compressExportGlb.mockRejectedValue(new Error('encoder unavailable'))

      expect(await artifactSizes({...ARTIFACT}, 'draco', false, 'balanced', true)).toBeNull()
      expect(await gzippedExport({...ARTIFACT}, 'draco', null, false, 'balanced', false)).toBeNull()
    })
  })


  describe('artifactPositionRange', () => {
    it('rides on the header read the size line already made', async () => {
      // A property of the ARTIFACT, not of a selection: the caption needs it,
      // and paying a second OPFS read for a number already parsed out of the
      // same JSON chunk would undo the point of the cheap path.
      readModelByPathFromOPFS.mockResolvedValue(await cachedArtifact())
      const artifact = {...ARTIFACT}

      await artifactSizes(artifact)
      const range = await artifactPositionRange(artifact)

      expect(readModelByPathFromOPFS).toHaveBeenCalledTimes(1)
      // The fixture's POSITION accessor declares no bounds, which is the
      // "show no figure" case.
      expect(range).toBeNull()
    })

    it('has nothing to give before the loader publishes an artifact', async () => {
      expect(await artifactPositionRange(null)).toBeNull()
    })
  })
})
