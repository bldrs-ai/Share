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
  QUALITY_LABELS,
  QUALITY_LEVELS,
  QUALITY_SMALLEST,
  QUALITY_SMOOSHED,
  QUALITY_SQUASHED,
  formatMaxShift,
  isDracoOnlyRung,
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
    it('offers exactly five, and defaults to Balanced', () => {
      expect(QUALITY_LEVELS).toEqual(
        [QUALITY_BEST, QUALITY_BALANCED, QUALITY_SMALLEST, QUALITY_SQUASHED, QUALITY_SMOOSHED])
      expect(QUALITY_DEFAULT).toBe(QUALITY_BALANCED)
      expect(isQualityLevel(QUALITY_BALANCED)).toBe(true)
      expect(isQualityLevel('tiny')).toBe(false)
      expect(isQualityLevel(undefined)).toBe(false)
    })

    it('labels the size hint without ever claiming a rung is THE smallest', () => {
      // The owner's #1852 wording: a larger/medium/small/tiny ladder, chosen
      // knowing the byte ordering is not guaranteed (module doc). What the
      // labels may not do is turn that hint into a superlative — "Smallest"
      // on a rung the encoders measured HEAVIER than Balanced under
      // SEQUENTIAL would be a promise the table cannot keep, which is the
      // whole reason the id/label split exists.
      expect(QUALITY_LEVELS.map((level) => QUALITY_LABELS[level])).toEqual([
        'Best (larger)',
        'Balanced (medium)',
        'Reduced (small)',
        'Squashed (lossy, tiny)',
        'Smooshed (lossy, micro)',
      ])
      for (const label of Object.values(QUALITY_LABELS)) {
        expect(label).not.toMatch(/smallest|tiniest|best size/i)
      }
      // The bottom two share one shape — `<name> (lossy, <size>)` — so the
      // pair reads as one step past the top three rather than as two
      // unrelated options, and the word a skimming user meets is "lossy".
      for (const level of [QUALITY_SQUASHED, QUALITY_SMOOSHED]) {
        expect(QUALITY_LABELS[level]).toMatch(/^\w+ \(lossy, \w+\)$/)
      }
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

    it('spends bits, not just encoder effort, only on the coarse rungs', () => {
      expect(qualitySettings(QUALITY_SMALLEST)).toEqual({
        draco: {encodeSpeed: 0, decodeSpeed: 0, quantizationBits: {POSITION: 12, NORMAL: 8}},
        isMeshoptFiltered: true,
      })
    })

    it('spends the swept bits, and only those, on the two lossy rungs', () => {
      // The sweep's picks, not round numbers: NORMAL is where the bytes are
      // (N8→N6 at POSITION 12 measured −11.3% and moved no vertex, and NORMAL
      // keeps paying past where POSITION stops), while POSITION is spent only
      // where a rung needs a visibly coarser SHAPE, because its cost is the
      // millimetre figure the panel promises a user's model. The module doc
      // carries the whole table. Pinned exactly: a bit count nudged by one
      // changes that promise.
      expect(qualitySettings(QUALITY_SQUASHED)).toEqual({
        draco: {encodeSpeed: 0, decodeSpeed: 0, quantizationBits: {POSITION: 10, NORMAL: 6}},
        isMeshoptFiltered: true,
      })
      expect(qualitySettings(QUALITY_SMOOSHED)).toEqual({
        draco: {encodeSpeed: 0, decodeSpeed: 0, quantizationBits: {POSITION: 8, NORMAL: 4}},
        isMeshoptFiltered: true,
      })
    })

    it('separates the two lossy rungs on every axis the panel shows', () => {
      // Two options a user cannot tell apart are worse UI than one, so the
      // pair was picked for SEPARATION as much as for size. Measured on
      // Momentum EDGEBREAKER they are 164,616 B against 134,748 B — the
      // second −18.1% below the first — and the two axes this module owns
      // have to move with it: a coarser POSITION grid (which the caption
      // quotes) and a coarser NORMAL one (which the renderer shows). A rung
      // that differed in neither would be a relabelling.
      const tiny = qualitySettings(QUALITY_SQUASHED).draco.quantizationBits
      const micro = qualitySettings(QUALITY_SMOOSHED).draco.quantizationBits

      expect(micro.POSITION).toBeLessThan(tiny.POSITION)
      expect(micro.NORMAL).toBeLessThan(tiny.NORMAL)
      // Four times the grid step, not one notch: the printed bounds are
      // "19 mm" and "75 mm" on Momentum, which is the difference a user reads.
      expect(maxPositionShift(QUALITY_SMOOSHED, MOMENTUM_RANGE_M))
        .toBeGreaterThan(3 * maxPositionShift(QUALITY_SQUASHED, MOMENTUM_RANGE_M))
      expect(formatMaxShift(maxPositionShift(QUALITY_SMOOSHED, MOMENTUM_RANGE_M))).toBe('75 mm')
    })

    it('marks the rungs Meshopt cannot tell apart, and only those', () => {
      // `EXTMeshoptCompression`'s whole encoder surface in the pinned 4.3.0 is
      // `{method}`, with two values — Balanced already spends the coarser one,
      // so the three rungs below it re-encode to Balanced's file byte for
      // byte. The
      // panel captions that rather than shipping a rung that silently does
      // nothing under the codec the user has selected (#1852).
      expect(isDracoOnlyRung(QUALITY_BEST)).toBe(false)
      expect(isDracoOnlyRung(QUALITY_BALANCED)).toBe(false)
      expect(isDracoOnlyRung(QUALITY_SMALLEST)).toBe(true)
      expect(isDracoOnlyRung(QUALITY_SQUASHED)).toBe(true)
      expect(isDracoOnlyRung(QUALITY_SMOOSHED)).toBe(true)
      // Derived from the table rather than listed, so the claim survives an
      // unknown rung the same way every other read of the table does.
      expect(isDracoOnlyRung('turbo')).toBe(isDracoOnlyRung(QUALITY_DEFAULT))
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

    it('names nothing but the three encoder options a rung is allowed to set', () => {
      // An ALLOWLIST, not a list of banned keys, because the whole table is
      // spread straight into `setEncoderOptions`
      // (`glbCompression.js#transformGlb`) and every key it grows reaches the
      // encoder. Two that must not be there, one of them the reason this test
      // was widened (#1852 review):
      //
      //   - `method`. SEQUENTIAL is what preserves the triangle order
      //     `BLDRS_face_ids` indexes identity by, and it is DERIVED from the
      //     layout. A rung carrying one would be spread in beside the derived
      //     value and whichever landed last would win.
      //   - `quantizationVolume`. Pinned at `@gltf-transform`'s `'mesh'`
      //     default, which is also the volume `maxPositionShift` computes the
      //     caption's millimetres in. `'scene'` measured 4× worse RMS error at
      //     the same bit count AND would silently turn "parts may move up to
      //     X mm" into an understatement by scene-extent ÷ part-extent — worst
      //     on exactly the large-board-with-small-parts models this would be
      //     sold on.
      //
      // Only Best and the coarse rung are pinned with an exact `toEqual`
      // above, so a key added to Balanced alone reached the encoder with
      // nothing red. This closes all three at once, and catches the next key
      // too.
      for (const level of QUALITY_LEVELS) {
        expect(Object.keys(qualitySettings(level)).sort()).toEqual(['draco', 'isMeshoptFiltered'])
        expect(Object.keys(qualitySettings(level).draco).sort())
          .toEqual(['decodeSpeed', 'encodeSpeed', 'quantizationBits'])
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

    it('is the same at Best and Balanced, and coarser at the rung below', () => {
      // Balanced buys its bytes from the encoder, not from the geometry.
      expect(maxPositionShift(QUALITY_BALANCED, MOMENTUM_RANGE_M))
        .toBe(maxPositionShift(QUALITY_BEST, MOMENTUM_RANGE_M))
      expect(maxPositionShift(QUALITY_SMALLEST, MOMENTUM_RANGE_M))
        .toBeGreaterThan(maxPositionShift(QUALITY_BEST, MOMENTUM_RANGE_M))
      expect(maxPositionShift(QUALITY_SQUASHED, MOMENTUM_RANGE_M))
        .toBeGreaterThan(maxPositionShift(QUALITY_SMALLEST, MOMENTUM_RANGE_M))
    })

    it('bounds the lossy rungs too, and prints them large rather than softened', () => {
      // Measured through an encode→decode round trip on the Momentum fixture:
      // 10.645 mm at POSITION 10 and 64.204 mm at POSITION 8, against
      // predictions of 18.62 and 74.72. Tens of millimetres is the honest
      // signal for a view-only file and the caption must not round it down
      // into something reassuring, so the printed figures are pinned here as
      // well as the arithmetic.
      const at10 = maxPositionShift(QUALITY_SQUASHED, MOMENTUM_RANGE_M) * 1000
      const at8 = maxPositionShift(QUALITY_SMOOSHED, MOMENTUM_RANGE_M) * 1000

      expect(at10).toBeGreaterThan(10.645)
      expect(at10).toBeLessThan(10.645 * 2)
      expect(at8).toBeGreaterThan(64.204)
      expect(at8).toBeLessThan(64.204 * 2)
      expect(formatMaxShift(maxPositionShift(QUALITY_SQUASHED, MOMENTUM_RANGE_M))).toBe('19 mm')
      expect(formatMaxShift(maxPositionShift(QUALITY_SMOOSHED, MOMENTUM_RANGE_M))).toBe('75 mm')
    })

    it('scales with the model, which is why it is worth showing at all', () => {
      // A 5 cm bolt in local geometry space quantizes in a 5 cm box, so the
      // coarse rung costs it micrometres — the number a user needs to see
      // before deciding, and the reason a fixed "12 bits" caption would be
      // useless. Printed as 0.02 mm rather than 0.0106: two decimals is the
      // finest the caption goes and it rounds UP to stay a bound, so at this
      // scale it overstates by up to a hundredth of a millimetre. Still the
      // right direction — a bolt this figure understated would be a caption
      // the file breaks.
      const bolt = maxPositionShift(QUALITY_SMALLEST, BOLT_RANGE_M)
      expect(bolt * 1000).toBeLessThan(0.02)
      expect(formatMaxShift(bolt)).toBe('0.02 mm')
    })

    it('has nothing to say when the artifact declares no bounds', () => {
      expect(maxPositionShift(QUALITY_SMALLEST, null)).toBeNull()
      expect(maxPositionShift(QUALITY_SMALLEST, 0)).toBeNull()
    })

    it('prints a figure a modeller reads, not a float', () => {
      expect(formatMaxShift(0.0040670)).toBe('4.1 mm')
      expect(formatMaxShift(0.0106450)).toBe('11 mm')
      expect(formatMaxShift(0.0001234)).toBe('0.13 mm')
      // Floored rather than rounded to zero: below this the figure says less
      // than float32's own rounding does, and overstating a worst case is the
      // safe direction.
      expect(formatMaxShift(0.0000001)).toBe('0.01 mm')
    })

    it('rounds the printed figure UP, at every precision it prints', () => {
      // "up to X" is a bound, so the display must not shave it. Each of these
      // rounds DOWN to nearest — 4.64→"4.6", 10.49→"10", 0.124→"0.12" — and a
      // vertex can land near the unrounded value, which would make the
      // caption promise less movement than the file can contain.
      expect(formatMaxShift(0.004640)).toBe('4.7 mm')
      expect(formatMaxShift(0.010490)).toBe('11 mm')
      expect(formatMaxShift(0.0001240)).toBe('0.13 mm')
      // And a figure already ON a display tick stays there: `4.6 * 10` is
      // 46.00000000000001 in binary floating point, which a bare `Math.ceil`
      // would inflate by a whole step.
      expect(formatMaxShift(0.004600)).toBe('4.6 mm')
      expect(formatMaxShift(0.011000)).toBe('11 mm')
      expect(formatMaxShift(0.000120)).toBe('0.12 mm')
    })
  })
})
