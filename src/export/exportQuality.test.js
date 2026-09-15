// The Quality rungs as a TABLE and as arithmetic, with no encoder in sight.
//
// `glbCompression.test.js` is where the rungs meet the real Draco and Meshopt
// wasm and prove they actually reach the encoder. This suite pins the other
// half: exactly which options each rung asks for — the pair of Draco speed
// settings above all, since either one alone measured a 0.0% change and a
// half-applied pair would look like a working feature — and the millimetre
// figure the panel prints, which is a promise about a user's model and must
// be derived, not guessed.
import {
  QUALITY_BALANCED,
  QUALITY_BEST,
  QUALITY_DEFAULT,
  QUALITY_LEVELS,
  QUALITY_SMALLEST,
  formatMaxShift,
  isQualityLevel,
  maxPositionShift,
  qualitySettings,
} from './exportQuality'


/* eslint-disable no-magic-numbers */
// The Momentum fixture's worst primitive spans the whole 22.0 m scene, which
// is what makes it the interesting case: measured max positional error there
// was 1.056 mm at 14 bits and 4.067 mm at 12, so the figures below have a
// measurement to be checked against (#1848 §3).
const MOMENTUM_RANGE_M = 22.0
// The batched-native artifact's positions are in LOCAL geometry space, so a
// small part quantizes in a small box however large the site is.
const BOLT_RANGE_M = 0.05


describe('exportQuality', () => {
  describe('the rungs', () => {
    it('offers exactly three, and defaults to Balanced', () => {
      expect(QUALITY_LEVELS).toEqual([QUALITY_BEST, QUALITY_BALANCED, QUALITY_SMALLEST])
      expect(QUALITY_DEFAULT).toBe(QUALITY_BALANCED)
      expect(isQualityLevel(QUALITY_BALANCED)).toBe(true)
      expect(isQualityLevel('tiny')).toBe(false)
      expect(isQualityLevel(undefined)).toBe(false)
    })

    it('leaves Best exactly where #1842 shipped it', () => {
      // Best means "change nothing about the file's geometry from what the
      // export produced before there was a control". `@gltf-transform`
      // 4.3.0's pinned defaults are POSITION 14 / NORMAL 10 and speeds 5.
      expect(qualitySettings(QUALITY_BEST)).toEqual({
        draco: {encodeSpeed: 5, decodeSpeed: 5, quantizationBits: {POSITION: 14, NORMAL: 10}},
        isMeshoptFiltered: false,
      })
    })

    it('sets BOTH Draco speeds on Balanced, at Best\'s bit counts', () => {
      // The pair is the whole of A2 and it is all-or-nothing: measured on
      // Momentum, `encodeSpeed: 0` alone and `decodeSpeed: 0` alone each came
      // back at 250,184 B — 0.0% — while the two together came back at
      // 228,652 B, −8.6%. A rung that set one of them would look like it
      // worked and buy nothing.
      const {draco} = qualitySettings(QUALITY_BALANCED)
      expect(draco.encodeSpeed).toBe(0)
      expect(draco.decodeSpeed).toBe(0)
      // …and Balanced costs no fidelity: same bits as Best, so the same
      // vertices come back.
      expect(draco.quantizationBits).toEqual(qualitySettings(QUALITY_BEST).draco.quantizationBits)
    })

    it('spends bits, not just encoder effort, only on Smallest', () => {
      expect(qualitySettings(QUALITY_SMALLEST)).toEqual({
        draco: {encodeSpeed: 0, decodeSpeed: 0, quantizationBits: {POSITION: 12, NORMAL: 8}},
        isMeshoptFiltered: true,
      })
    })

    it('never names GENERIC, whose bits would corrupt a float-typed id', () => {
      // `_EXPRESSID`/`_INSTANCEID` fall into Draco's GENERIC bucket, and the
      // pinned 12-bit default is harmless ONLY because Share writes them as
      // Uint32Array and Draco's integer path ignores quantization bits. The
      // same attribute typed FLOAT came back corrupted at that default
      // (#1848 §4.3). Since `quantizationBits` MERGES with the library's
      // defaults, naming a bucket here is the only way to change it — so the
      // guarantee this suite can give is that no rung ever names this one.
      for (const level of QUALITY_LEVELS) {
        expect(Object.keys(qualitySettings(level).draco.quantizationBits).sort())
          .toEqual(['NORMAL', 'POSITION'])
      }
    })

    it('never names the Draco method, which is derived from the layout', () => {
      // SEQUENTIAL is what preserves the triangle order `BLDRS_face_ids`
      // indexes identity by. A rung carrying a `method` would be spread into
      // the encoder options beside the derived one, and whichever landed last
      // would win — so the table must not carry one at all.
      for (const level of QUALITY_LEVELS) {
        expect(qualitySettings(level).draco).not.toHaveProperty('method')
      }
    })

    it('falls back to the default rather than throwing on an unknown rung', () => {
      // Read on the path that produces a user's download — a "Download again"
      // row recorded before this feature existed carries no rung at all.
      expect(qualitySettings('turbo')).toBe(qualitySettings(QUALITY_DEFAULT))
      expect(qualitySettings(undefined)).toBe(qualitySettings(QUALITY_DEFAULT))
    })
  })

  describe('the millimetre figure', () => {
    it('bounds the error measured on the Momentum fixture', () => {
      // The caption's whole job is to be a promise the file keeps. Measured
      // through a Draco encode→decode round trip on that model: 1.056 mm max
      // at 14 bits, 4.067 mm at 12. The prediction has to be an upper bound
      // on both — close enough to be useful, never under.
      const at14 = maxPositionShift(QUALITY_BALANCED, MOMENTUM_RANGE_M) * 1000
      const at12 = maxPositionShift(QUALITY_SMALLEST, MOMENTUM_RANGE_M) * 1000

      expect(at14).toBeGreaterThan(1.056)
      expect(at14).toBeLessThan(1.056 * 1.2)
      expect(at12).toBeGreaterThan(4.067)
      expect(at12).toBeLessThan(4.067 * 1.2)
    })

    it('is the same at Best and Balanced, and coarser at Smallest', () => {
      // Balanced buys its bytes from the encoder, not from the geometry.
      expect(maxPositionShift(QUALITY_BALANCED, MOMENTUM_RANGE_M))
        .toBe(maxPositionShift(QUALITY_BEST, MOMENTUM_RANGE_M))
      expect(maxPositionShift(QUALITY_SMALLEST, MOMENTUM_RANGE_M))
        .toBeGreaterThan(maxPositionShift(QUALITY_BEST, MOMENTUM_RANGE_M))
    })

    it('scales with the model, which is why it is worth showing at all', () => {
      // A 5 cm bolt in local geometry space quantizes in a 5 cm box, so
      // Smallest costs it micrometres — the number a user needs to see before
      // deciding, and the reason a fixed "12 bits" caption would be useless.
      const bolt = maxPositionShift(QUALITY_SMALLEST, BOLT_RANGE_M)
      expect(bolt * 1000).toBeLessThan(0.02)
      expect(formatMaxShift(bolt)).toBe('0.01 mm')
    })

    it('has nothing to say when the artifact declares no bounds', () => {
      expect(maxPositionShift(QUALITY_SMALLEST, null)).toBeNull()
      expect(maxPositionShift(QUALITY_SMALLEST, 0)).toBeNull()
    })

    it('prints a figure a modeller reads, not a float', () => {
      expect(formatMaxShift(0.0040670)).toBe('4.1 mm')
      expect(formatMaxShift(0.0106450)).toBe('11 mm')
      expect(formatMaxShift(0.0001234)).toBe('0.12 mm')
      // Floored rather than rounded to zero: below this the figure says less
      // than float32's own rounding does, and overstating a worst case is the
      // safe direction.
      expect(formatMaxShift(0.0000001)).toBe('0.01 mm')
    })
  })
})
