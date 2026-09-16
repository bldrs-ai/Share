// The background codec sweep's decisions, with no encoder and no OPFS behind
// them: `artifactSizes` is the module that reads and encodes, and it has its
// own suite, so standing it in here is what lets this one assert on ORDER,
// on how often the sweep releases, and on what it does when told to stop.
import {
  COMPRESSION_DRACO,
  COMPRESSION_MESHOPT,
  COMPRESSION_NONE,
} from './glbCompression'
import {artifactSizes, releaseCompressedExport} from './artifactSizes'
import {
  AUTO_MEASURE_MAX_BYTES,
  CODEC_MEASUREMENT_ORDER,
  codecToSelect,
  measureCodecSizes,
  shouldAutoMeasure,
  smallestCodec,
} from './codecSizes'


jest.mock('./artifactSizes', () => ({
  artifactSizes: jest.fn(),
  releaseCompressedExport: jest.fn(),
}))


/* eslint-disable no-magic-numbers */
const ARTIFACT = {schemaVer: '0.21.0-batched', writtenAt: 1}
const QUALITY = 'balanced'

// The Momentum figures, which is the point of the whole feature: Draco wins
// by 5× on a geometry-heavy building model…
const MOMENTUM = {
  [COMPRESSION_NONE]: sizesOf(1959196),
  [COMPRESSION_MESHOPT]: sizesOf(1347740),
  [COMPRESSION_DRACO]: sizesOf(250184),
}
// …and loses by 2.6× on an instance-heavy one, because it cannot reach
// `EXT_mesh_gpu_instancing` accessors at all. Same panel, opposite answer.
const INSTANCE_HEAVY = {
  [COMPRESSION_NONE]: sizesOf(622480),
  [COMPRESSION_MESHOPT]: sizesOf(199032),
  [COMPRESSION_DRACO]: sizesOf(514752),
}
// The SAME instance-heavy artifact, measured gzipped — real figures from the
// #1854 sweep, and the reason `isGzipped` is a sweep axis and not a display
// detail. Draco leaves the instance transforms as raw float32 and the whole
// file gzips 3.08×; Meshopt compresses them into something gzip cannot touch
// (1.14×). So the ranking inverts: Meshopt wins raw, Draco wins gzipped.
const INSTANCE_HEAVY_GZIPPED = {
  [COMPRESSION_NONE]: sizesOf(196763),
  [COMPRESSION_MESHOPT]: sizesOf(173721),
  [COMPRESSION_DRACO]: sizesOf(171452),
}


/**
 * One codec's estimate, with a metadata payload worth a tenth of the file so
 * the two sides of the toggle are distinguishable.
 *
 * @param {number} withMetadata
 * @return {object} the shape `artifactSizes` resolves to
 */
function sizesOf(withMetadata) {
  const withoutMetadata = Math.round(withMetadata * 0.9)
  return {
    withMetadata,
    withoutMetadata,
    metadataBytes: withMetadata - withoutMetadata,
    compression: 'measured',
  }
}


/**
 * Answer each codec from a table.
 *
 * @param {object} table `{[mode]: ?sizes}`
 */
function resolveFrom(table) {
  artifactSizes.mockImplementation((artifact, mode) => Promise.resolve(table[mode] ?? null))
}


/**
 * Run the sweep and collect what it published, in the order it published it.
 *
 * @param {object} [options] merged over the defaults
 * @return {Promise<{published: Array<Array<*>>, sizesByCodec: object}>}
 */
async function sweep(options = {}) {
  const published = []
  const sizesByCodec = {}
  await measureCodecSizes(ARTIFACT, {
    quality: QUALITY,
    isPortable: false,
    isGzipped: false,
    isMetadataIncluded: true,
    onSize: (mode, sizes) => {
      published.push([mode, sizes])
      sizesByCodec[mode] = sizes
    },
    ...options,
  })
  return {published, sizesByCodec}
}


describe('codecSizes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resolveFrom(MOMENTUM)
  })

  describe('measureCodecSizes', () => {
    it('measures every codec cheapest first', async () => {
      // Measured on the Momentum fixture: `none` is a header read, Meshopt is
      // ~33 ms/MB from a module already in the bundle, Draco ~135 ms/MB behind
      // a second wasm the page has to fetch. Cheapest first means the first
      // figures are on the dropdown while the expensive one is still running.
      const {published} = await sweep()

      expect(published.map(([mode]) => mode))
        .toEqual([COMPRESSION_NONE, COMPRESSION_MESHOPT, COMPRESSION_DRACO])
      expect(CODEC_MEASUREMENT_ORDER)
        .toEqual([COMPRESSION_NONE, COMPRESSION_MESHOPT, COMPRESSION_DRACO])
    })

    it('runs one encoder at a time, never two', async () => {
      // Sequential is a memory decision, not a speed one: each estimate cell
      // holds two whole copies of the export, so overlapping runs would put
      // three codecs' worth beside the source.
      let inFlight = 0
      let worst = 0
      artifactSizes.mockImplementation(async (artifact, mode) => {
        inFlight++
        worst = Math.max(worst, inFlight)
        await Promise.resolve()
        inFlight--
        return MOMENTUM[mode]
      })

      await sweep()

      expect(worst).toBe(1)
    })

    it('never holds more than two codecs\' bytes at once', async () => {
      // The memory bound the sweep promises now that it keeps a best-so-far:
      // the best and the one in flight, never a third. Portable, because
      // that is the only setting under which all THREE codecs hold a cell —
      // natively `none` is a header read, so a sweep that released nothing
      // would still peak at two there and this count could not go red.
      //
      // Both tables, because the release SCHEDULE differs between them:
      // Momentum drops the old best each time, the instance-heavy one drops
      // the codec just measured.
      for (const table of [MOMENTUM, INSTANCE_HEAVY]) {
        jest.clearAllMocks()
        const resident = new Set()
        releaseCompressedExport.mockImplementation((artifact, mode) => resident.delete(mode))
        let worst = 0
        artifactSizes.mockImplementation((artifact, mode) => {
          resident.add(mode)
          worst = Math.max(worst, resident.size)
          return Promise.resolve(table[mode])
        })

        await sweep({isPortable: true})

        expect(worst).toBe(2)
      }
      releaseCompressedExport.mockReset()
    })

    it('keeps the winner, so selecting it does not re-encode', async () => {
      // Draco wins on Momentum and is measured last, so its cell is the one
      // left standing: the bytes the panel is about to select are already in
      // the cache and the export hands over those very bytes. Meshopt lost
      // and went.
      await sweep()

      expect(releaseCompressedExport)
        .not.toHaveBeenCalledWith(ARTIFACT, COMPRESSION_DRACO, false, QUALITY)
      expect(releaseCompressedExport)
        .toHaveBeenCalledWith(ARTIFACT, COMPRESSION_MESHOPT, false, QUALITY)
    })

    it('keeps a winner that was measured before the last codec', async () => {
      // The falsifying case for "keep the last one and hope": Meshopt wins on
      // an instance-heavy artifact — which is exactly what Share's batched
      // writer produces — and it is measured SECOND. Drop it when Draco
      // starts and the panel selects a codec whose cell is empty, so the size
      // line reverts to "Estimating…" and a fourth full encode runs on the
      // main thread seconds after the sweep declared itself done.
      resolveFrom(INSTANCE_HEAVY)

      await sweep()

      expect(releaseCompressedExport)
        .toHaveBeenCalledWith(ARTIFACT, COMPRESSION_DRACO, false, QUALITY)
      expect(releaseCompressedExport)
        .not.toHaveBeenCalledWith(ARTIFACT, COMPRESSION_MESHOPT, false, QUALITY)
    })

    it('keeps nothing when the winner is the cell that holds no bytes', async () => {
      // Native `none` is a header read with no cell to keep, so a sweep where
      // it wins must not go on holding a compressed codec for a selection
      // that will never read it.
      resolveFrom({...MOMENTUM, [COMPRESSION_NONE]: sizesOf(1)})

      await sweep()

      for (const mode of [COMPRESSION_MESHOPT, COMPRESSION_DRACO]) {
        expect(releaseCompressedExport).toHaveBeenCalledWith(ARTIFACT, mode, false, QUALITY)
      }
    })

    it('keeps nothing from a sweep that never finished', async () => {
      // `smallestCodec` names no winner until every codec has reported, so
      // after a Stop the best-so-far is bytes waiting for a selection that is
      // not coming.
      const controller = new AbortController()
      artifactSizes.mockImplementation((artifact, mode) => {
        if (mode === COMPRESSION_MESHOPT) {
          controller.abort()
        }
        return Promise.resolve(MOMENTUM[mode])
      })

      await sweep({signal: controller.signal})

      expect(releaseCompressedExport)
        .toHaveBeenCalledWith(ARTIFACT, COMPRESSION_MESHOPT, false, QUALITY)
    })

    it('never frees the cell behind the figure on screen', async () => {
      // Picking a codec mid-sweep fills its cell through the size line, and
      // the sweep then measures that same codec and beats it. Freeing it
      // there is unrecoverable from outside: the selection has not changed
      // again, so nothing re-estimates, and Export re-encodes up to the
      // auto-measure limit on the main thread (#1852 review).
      //
      // Portable, so `none` holds bytes too and the sweep has a second loser
      // to drop — protecting one cell must not read as switching the release
      // off.
      await sweep({isPortable: true, keepCodec: () => COMPRESSION_MESHOPT})

      expect(releaseCompressedExport)
        .not.toHaveBeenCalledWith(ARTIFACT, COMPRESSION_MESHOPT, true, QUALITY)
      expect(releaseCompressedExport)
        .toHaveBeenCalledWith(ARTIFACT, COMPRESSION_NONE, true, QUALITY)
    })

    it('reads the selection at each release, not once when the run starts', async () => {
      // The interesting half of the case above: the user picks the codec
      // WHILE the sweep runs, which is exactly the window in which it is
      // about to be beaten. A protected codec captured at the top of the run
      // would have said "nothing is selected" and dropped the cell the size
      // line had just filled.
      let selected = null
      artifactSizes.mockImplementation((artifact, mode) => {
        if (mode === COMPRESSION_DRACO) {
          selected = COMPRESSION_MESHOPT
        }
        return Promise.resolve(MOMENTUM[mode])
      })

      await sweep({isPortable: true, keepCodec: () => selected})

      expect(releaseCompressedExport)
        .not.toHaveBeenCalledWith(ARTIFACT, COMPRESSION_MESHOPT, true, QUALITY)
      // `none` was beaten before the selection moved, so it still goes.
      expect(releaseCompressedExport)
        .toHaveBeenCalledWith(ARTIFACT, COMPRESSION_NONE, true, QUALITY)
    })

    it('measures at the quality and Portable setting it was given', async () => {
      // The codec axis only, at the CURRENT point on the other two — the
      // cross product is what this feature deliberately does not compute.
      await sweep({quality: 'smallest', isPortable: true})

      for (const mode of CODEC_MEASUREMENT_ORDER) {
        expect(artifactSizes).toHaveBeenCalledWith(ARTIFACT, mode, true, 'smallest', false)
      }
      expect(artifactSizes).toHaveBeenCalledTimes(CODEC_MEASUREMENT_ORDER.length)
    })

    it('measures what the user receives once the download is gzipped', async () => {
      // Not a display detail: the figures the sweep publishes are the ones
      // `codecToSelect` reads the winner off, so measuring raw bytes for a
      // gzipped download would recommend a codec on a file nobody gets.
      await sweep({isGzipped: true})

      for (const mode of CODEC_MEASUREMENT_ORDER) {
        expect(artifactSizes).toHaveBeenCalledWith(ARTIFACT, mode, false, QUALITY, true)
      }
    })

    it('picks a different codec gzipped than raw, on the shape Share writes', async () => {
      // The #1854 finding, asserted rather than only narrated. Same artifact,
      // measured both ways: Meshopt 199,032 B beats Draco 514,752 B raw, and
      // Draco 171,452 B beats Meshopt 173,721 B gzipped. Draco's output is
      // near-incompressible but the instance transforms it leaves alone are
      // not, so gzip closes a 2.6× gap and crosses it — on exactly the
      // instance-heavy shape the batched-native writer produces.
      resolveFrom(INSTANCE_HEAVY)
      const raw = await sweep()

      resolveFrom(INSTANCE_HEAVY_GZIPPED)
      const gzipped = await sweep({isGzipped: true})

      expect(smallestCodec(raw.sizesByCodec, true)).toBe(COMPRESSION_MESHOPT)
      expect(smallestCodec(gzipped.sizesByCodec, true)).toBe(COMPRESSION_DRACO)
    })

    it('releases the uncompressed cell once gzip makes it hold bytes', async () => {
      // Native `none` is a header read and caches nothing — until gzip, which
      // has no header shortcut and so leaves the whole export resident. A
      // sweep that still thought that cell was free would hold a beaten
      // codec's entire file for the life of the artifact. Here `none` loses
      // (it is the largest of the three gzipped figures), so it must go.
      resolveFrom(INSTANCE_HEAVY_GZIPPED)

      await sweep({isGzipped: true})

      expect(releaseCompressedExport).toHaveBeenCalledWith(ARTIFACT, COMPRESSION_NONE, false, QUALITY)
    })

    it('releases the uncompressed cell too once Portable is on', async () => {
      // Portable + None is not the cheap header read — the rewrite reads the
      // whole artifact and caches its bytes — so it is a cell that has to be
      // released like any other.
      await sweep({isPortable: true})

      expect(releaseCompressedExport).toHaveBeenCalledWith(ARTIFACT, COMPRESSION_NONE, true, QUALITY)
    })

    it('stops the queue on abort, and keeps what it already measured', async () => {
      // The encoders are synchronous wasm with no abort, so what a cancel can
      // stop is the NEXT codec. Aborting while Meshopt is in flight therefore
      // leaves Meshopt's figure on the dropdown — it has already been paid
      // for — and never starts Draco.
      const controller = new AbortController()
      artifactSizes.mockImplementation((artifact, mode) => {
        if (mode === COMPRESSION_MESHOPT) {
          controller.abort()
        }
        return Promise.resolve(MOMENTUM[mode])
      })

      const {published} = await sweep({signal: controller.signal})

      expect(published.map(([mode]) => mode)).toEqual([COMPRESSION_NONE, COMPRESSION_MESHOPT])
      expect(artifactSizes).not.toHaveBeenCalledWith(ARTIFACT, COMPRESSION_DRACO, false, QUALITY, false)
    })

    it('starts nothing at all when the signal is already aborted', async () => {
      const controller = new AbortController()
      controller.abort()

      const {published} = await sweep({signal: controller.signal})

      expect(published).toEqual([])
      expect(artifactSizes).not.toHaveBeenCalled()
    })

    it('says which codec is running, and that none is when it is done', async () => {
      // What the panel's status line reads, and — after a Stop — which codec
      // it names as still finishing.
      const running = []

      await sweep({onCodec: (mode) => running.push(mode)})

      expect(running).toEqual([
        COMPRESSION_NONE, COMPRESSION_MESHOPT, COMPRESSION_DRACO, null,
      ])
    })

    it('publishes a codec that could not be measured, rather than stalling on it', async () => {
      // An encoder that isn't available here, or an artifact that was
      // evicted. A sweep that waited for a figure that is never coming would
      // never select anything.
      resolveFrom({...MOMENTUM, [COMPRESSION_DRACO]: null})

      const {published, sizesByCodec} = await sweep()

      expect(published.map(([mode]) => mode)).toEqual(CODEC_MEASUREMENT_ORDER)
      expect(sizesByCodec[COMPRESSION_DRACO]).toBeNull()
      expect(smallestCodec(sizesByCodec, true)).toBe(COMPRESSION_MESHOPT)
    })
  })

  describe('shouldAutoMeasure', () => {
    it('starts unasked below the threshold and never above it', () => {
      // ~170 ms/MB across the codec axis, uninterruptible, so 50 MB is about
      // eight seconds of main-thread work — the point at which the user
      // should be the one who asks.
      expect(shouldAutoMeasure(2 * 1024 * 1024)).toBe(true)
      expect(shouldAutoMeasure(AUTO_MEASURE_MAX_BYTES)).toBe(true)
      expect(shouldAutoMeasure(AUTO_MEASURE_MAX_BYTES + 1)).toBe(false)
    })

    it('starts nothing when the artifact size is unknown', () => {
      expect(shouldAutoMeasure(null)).toBe(false)
      expect(shouldAutoMeasure(undefined)).toBe(false)
      expect(shouldAutoMeasure(0)).toBe(false)
    })
  })

  describe('smallestCodec', () => {
    it('waits for every codec before naming one', () => {
      // A winner declared before Draco has run is a recommendation the next
      // second contradicts — and on Momentum, Draco is the winner by 5×.
      expect(smallestCodec({[COMPRESSION_NONE]: MOMENTUM[COMPRESSION_NONE]}, true)).toBeNull()
      expect(smallestCodec({
        [COMPRESSION_NONE]: MOMENTUM[COMPRESSION_NONE],
        [COMPRESSION_MESHOPT]: MOMENTUM[COMPRESSION_MESHOPT],
      }, true)).toBeNull()
      expect(smallestCodec(MOMENTUM, true)).toBe(COMPRESSION_DRACO)
    })

    it('gets the opposite answer on an instance-heavy artifact', () => {
      // The measurement that justifies the whole feature: Draco encodes
      // primitives only, so on the shape Share's batched writer produces
      // Meshopt wins by 2.6× and the reputation-based guess is wrong.
      expect(smallestCodec(INSTANCE_HEAVY, true)).toBe(COMPRESSION_MESHOPT)
    })

    it('compares the figure the panel is showing', () => {
      // One estimate produces both sides of the metadata toggle. Choosing on
      // the other side could seat the "winner" beside a larger number than an
      // option it beat.
      const sizes = {
        [COMPRESSION_NONE]: {withMetadata: 100, withoutMetadata: 100},
        [COMPRESSION_MESHOPT]: {withMetadata: 90, withoutMetadata: 80},
        [COMPRESSION_DRACO]: {withMetadata: 85, withoutMetadata: 84},
      }

      expect(smallestCodec(sizes, true)).toBe(COMPRESSION_DRACO)
      expect(smallestCodec(sizes, false)).toBe(COMPRESSION_MESHOPT)
    })

    it('does not wait for a codec that already answered "no figure"', () => {
      expect(smallestCodec({...MOMENTUM, [COMPRESSION_DRACO]: null}, true)).toBe(COMPRESSION_MESHOPT)
      expect(smallestCodec({
        [COMPRESSION_NONE]: null, [COMPRESSION_MESHOPT]: null, [COMPRESSION_DRACO]: null,
      }, true)).toBeNull()
    })
  })

  describe('codecToSelect', () => {
    it('picks the smallest once the sweep is done', () => {
      expect(codecToSelect(MOMENTUM, true, false, COMPRESSION_NONE)).toBe(COMPRESSION_DRACO)
    })

    it('never overrides a codec the user chose themselves', () => {
      // Even when the user's choice is the largest file on the list. A
      // dropdown that moves under the cursor because a later figure came in
      // smaller is worse than a suboptimal default.
      expect(codecToSelect(MOMENTUM, true, true, COMPRESSION_MESHOPT)).toBeNull()
      expect(codecToSelect(MOMENTUM, true, true, COMPRESSION_NONE)).toBeNull()
    })

    it('leaves the selection alone when it is already the smallest', () => {
      expect(codecToSelect(MOMENTUM, true, false, COMPRESSION_DRACO)).toBeNull()
    })

    it('leaves it alone while the sweep is unfinished', () => {
      expect(codecToSelect({[COMPRESSION_NONE]: MOMENTUM[COMPRESSION_NONE]}, true, false, COMPRESSION_NONE))
        .toBeNull()
    })
  })
})
