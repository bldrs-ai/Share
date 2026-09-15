// What "Quality" means to each codec, and what it costs the geometry.
//
// Until #1848 the export set exactly ONE encoder option per codec — Draco's
// `method`, Meshopt's `method` — and took `@gltf-transform` 4.3.0's defaults
// for everything else. The measured headroom behind those defaults is large
// enough to be worth a control, but the two codecs' knobs do not line up: a
// shared "12 bits" would mean two different things, and for Meshopt it would
// mean nothing at all. So the control is three named rungs and this module is
// the single table that says what each rung asks of each encoder.
//
// The rungs are FIDELITY rungs, not size rungs. Nothing here promises that
// the coarsest rung weighs less than Best — measured, it usually does, but
// Draco's speed pair is an encoder-effort knob whose payoff is model-shaped
// (below), and the panel shows the real measured size for the current
// selection anyway. Claiming a monotone ladder in the UI would be a promise
// this module cannot keep, which is why the label the user reads is
// "Reduced" and not "Smallest" — see `QUALITY_LABELS`.
//
// Measured on `src/tests/fixtures/Momentum.ifc` → GLB (1,959,196 B, 43
// primitives, 71,307 triangles), through the same `ALL_EXTENSIONS` IO and the
// same shipped encoders `glbCompression.js#transformGlb` uses:
//
//   Meshopt QUANTIZE (was the only setting)  1,347,740 B
//   Meshopt FILTER                             820,912 B   −39.1%
//   Draco EDGEBREAKER, speeds 5 (was)          250,184 B
//   Draco EDGEBREAKER, speeds 0+0              228,652 B    −8.6%
//   Draco EDGEBREAKER, POSITION:12 NORMAL:8
//     + speeds 0+0                             194,932 B   −22.1%
//
// Two results that shape the table and are easy to get wrong:
//
//   - `encodeSpeed` and `decodeSpeed` must BOTH be 0. Either one alone
//     measured exactly 0.0% on that model — 250,184 B either way. Draco's
//     `SetSpeedOptions` takes the pair, and the aggressive entropy coding
//     only comes on when neither side asks for speed.
//   - The speed pair is not a universal win. Measured +0.5% on the same model
//     under SEQUENTIAL, and +2.4% on an instance-heavy synthetic. It is a
//     clear win on EDGEBREAKER over real building geometry (−8.6% on
//     Momentum, −6.0% on `public/index.ifc`), which is what the batched-native
//     default artifact takes, so it rides on Balanced and the coarse rung —
//     but see the note above about not promising a ladder.
//
// What is deliberately NOT here, each an owner decision recorded in #1848 §4:
//
//   - `quantizationVolume`. Stays at `@gltf-transform`'s `'mesh'` default.
//     `'scene'` measured 4× worse RMS error at the same bit count, and the
//     penalty grows with scene-extent ÷ part-extent — worst exactly on the
//     large-board-with-small-parts models this would be sold on. `'mesh'` is
//     also the volume `maxPositionShift` below computes the caption's
//     millimetres in, so a rung that reached for `'scene'` would understate
//     its own bound by that same ratio. `exportQuality.test.js` guards the
//     table with a key ALLOWLIST rather than a ban list for that reason —
//     every key here is spread straight into `setEncoderOptions`.
//   - `quantizationBits.GENERIC`. `_EXPRESSID`/`_INSTANCEID` map to Draco's
//     GENERIC bucket, and are safe today only because Share writes them as
//     `Uint32Array` (`viewer/ifc/batchedToMergedMesh.js`), which takes Draco's
//     integer path where quantization bits are ignored. The same attribute
//     typed FLOAT came back corrupted at the pinned 12-bit default. Not
//     exposed — and since `quantizationBits` MERGES with the library's
//     defaults, the guard `exportQuality.test.js` can give is that no rung
//     ever names that bucket.
//   - The Draco `method`. Derived from `needsTriangleOrder`, never from
//     quality: SEQUENTIAL is what preserves the triangle order
//     `BLDRS_face_ids` indexes identity by, and a rung that "also picks
//     edgebreaker for smaller files" would silently break re-import picking.
//
// Design: design/new/glb-export-premium.md §4.3.

/** Today's shipped fidelity: nothing about the file's geometry changes. */
export const QUALITY_BEST = 'best'
/** Highest fidelity, encoder tuned for size. The default. */
export const QUALITY_BALANCED = 'balanced'
/** Fewer position/normal bits — the coarsest rung offered. */
export const QUALITY_SMALLEST = 'smallest'

/** The choices the Export tab offers, in the order it offers them. */
export const QUALITY_LEVELS = [QUALITY_BEST, QUALITY_BALANCED, QUALITY_SMALLEST]

/**
 * What each choice is called on the control.
 *
 * "Reduced", not "Smallest", and the divergence from the id is deliberate:
 * the id is written into export-history rows and estimate cache keys and has
 * to keep meaning the same thing across a rename, while the LABEL is a claim
 * made to the user. The module doc's own measurements say the coarse rung is
 * not guaranteed to weigh less (+0.5% under SEQUENTIAL on Momentum, +2.4% on
 * an instance-heavy synthetic), so a superlative about size is a promise the
 * table cannot keep. "Reduced" names what the rung really does change —
 * fidelity — which is also the axis the caption underneath quantifies.
 */
export const QUALITY_LABELS = {
  [QUALITY_BEST]: 'Best',
  [QUALITY_BALANCED]: 'Balanced',
  [QUALITY_SMALLEST]: 'Reduced',
}

/**
 * Balanced, not Best.
 *
 * The one decision this default really makes is Meshopt `FILTER`, which is
 * the largest single win in #1848 — −39.1% measured — for a cost that is
 * narrow and knowable: positions come back BIT-EXACT (0.000000 mm over all
 * 60,608 vertices of the Momentum fixture, verified through a decode round
 * trip), and only `NORMAL`/`TANGENT` are touched, rewritten octahedrally as
 * normalized `BYTE` at ≤1.155° of angular error. A shading normal a degree
 * out is invisible in a renderer and means nothing to a measurement; 39% of
 * the file is the whole reason a user picked a codec. So it is the default
 * rather than a rung the informed user has to find.
 *
 * It is not the ONLY setting, though, which is the other half of the answer:
 * a QA or survey round trip that has to be bit-exact in every attribute needs
 * a rung that guarantees it, and Best is that rung (Meshopt `QUANTIZE`, which
 * is entirely lossless — Share never runs `quantize()`, and meshopt's vertex
 * codec is a lossless entropy coder).
 */
export const QUALITY_DEFAULT = QUALITY_BALANCED

// Draco quantizes over the largest axis of the quantization volume in
// 2^bits − 1 steps, so the worst-case displacement of a vertex is half the
// diagonal of one step cell: (√3/2) × range / (2^bits − 1). Measured against
// a SEQUENTIAL encode→decode round trip on the Momentum fixture, this is a
// true upper bound rather than an estimate — predicted 1.163 mm against
// 1.056 mm measured at 14 bits, 4.653 mm against 4.067 mm at 12.
const HALF_DIAGONAL_OF_UNIT_CUBE = Math.sqrt(3) / 2
const MM_PER_M = 1000
// Below this the figure says less than float32's own rounding does, and
// "0.00 mm" reads as a bug. Overstating a worst case is the safe direction.
// Rounding up already lifts every positive figure to at least this, so what
// the clamp still catches is an exact zero.
const MIN_REPORTED_MM = 0.01
const MM_ONE_DECIMAL_BELOW = 10
const MM_TWO_DECIMALS_BELOW = 1
// `4.6 * 10` is 46.00000000000001 in binary floating point, and a bare
// `Math.ceil` would read that noise as a whole extra display step. Twelve
// significant digits is far more than any figure here carries and far fewer
// than the ~16 where the noise lives.
const CEIL_SIGNIFICANT_DIGITS = 12

// Per rung, what each encoder is asked for. `quantizationBits` is MERGED with
// `@gltf-transform`'s own defaults rather than replacing them
// (`khr-draco-mesh-compression/encoder.ts#encodeGeometry`), which is why
// COLOR, TEX_COORD and — critically — GENERIC are absent here and keep their
// pinned values.
const QUALITY_SETTINGS = {
  [QUALITY_BEST]: {
    draco: {encodeSpeed: 5, decodeSpeed: 5, quantizationBits: {POSITION: 14, NORMAL: 10}},
    isMeshoptFiltered: false,
  },
  [QUALITY_BALANCED]: {
    draco: {encodeSpeed: 0, decodeSpeed: 0, quantizationBits: {POSITION: 14, NORMAL: 10}},
    isMeshoptFiltered: true,
  },
  [QUALITY_SMALLEST]: {
    draco: {encodeSpeed: 0, decodeSpeed: 0, quantizationBits: {POSITION: 12, NORMAL: 8}},
    isMeshoptFiltered: true,
  },
}


/**
 * @param {*} quality
 * @return {boolean} true for one of the three rungs the UI offers
 */
export function isQualityLevel(quality) {
  return QUALITY_LEVELS.includes(quality)
}


/**
 * What one rung asks of each encoder.
 *
 * An unknown rung resolves to the default rather than throwing: this is read
 * on the path that produces a user's download, and a stale permalink or a
 * hand-edited history row must not cost them the export.
 *
 * @param {string} quality One of `QUALITY_LEVELS`
 * @return {{draco: {encodeSpeed: number, decodeSpeed: number,
 *   quantizationBits: {POSITION: number, NORMAL: number}}, isMeshoptFiltered: boolean}}
 */
export function qualitySettings(quality) {
  return QUALITY_SETTINGS[isQualityLevel(quality) ? quality : QUALITY_DEFAULT]
}


/**
 * The worst-case distance a vertex can move under Draco at this rung, in
 * metres — the arithmetic above, applied to the artifact's own geometry.
 *
 * Meshopt is not a case here: positions are bit-exact at every rung, measured
 * over every vertex of the Momentum fixture, so its caption says so in words
 * instead of quoting a number that would be zero.
 *
 * @param {string} quality One of `QUALITY_LEVELS`
 * @param {?number} positionRange The largest axis of the largest primitive's
 *   own bounding box (`loader/glbArtifactSize.js#positionQuantizationRange`),
 *   which is the volume Draco quantizes in at the pinned `'mesh'` default
 * @return {?number} metres, or null when the artifact's bounds are unknown
 */
export function maxPositionShift(quality, positionRange) {
  if (!(positionRange > 0)) {
    return null
  }
  const {POSITION} = qualitySettings(quality).draco.quantizationBits
  return HALF_DIAGONAL_OF_UNIT_CUBE * positionRange / ((2 ** POSITION) - 1)
}


/**
 * @param {number} mm
 * @param {number} decimals
 * @return {number} mm rounded UP at that many decimals
 */
function ceilTo(mm, decimals) {
  const factor = 10 ** decimals
  return Math.ceil(Number((mm * factor).toPrecision(CEIL_SIGNIFICANT_DIGITS))) / factor
}


/**
 * That distance as the panel prints it. Millimetres, because that is the unit
 * a building modeller decides in — "POSITION: 12 bits" is not a decision
 * anybody can make.
 *
 * Rounded UP at whatever precision is shown, never to nearest. The caption
 * says "parts may move up to X", which is a bound and not an estimate: at
 * `Math.round`, 4.64 mm printed as "4.6 mm" and 10.49 mm as "10 mm", and a
 * vertex really can land near the unrounded figure. Overstating the worst
 * case by less than one display step is the safe direction; understating it
 * makes the caption a promise the file does not keep.
 *
 * @param {number} metres
 * @return {string} e.g. '4.1 mm'
 */
export function formatMaxShift(metres) {
  const mm = metres * MM_PER_M
  if (mm >= MM_ONE_DECIMAL_BELOW) {
    return `${ceilTo(mm, 0)} mm`
  }
  if (mm >= MM_TWO_DECIMALS_BELOW) {
    return `${ceilTo(mm, 1).toFixed(1)} mm`
  }
  return `${Math.max(ceilTo(mm, 2), MIN_REPORTED_MM).toFixed(2)} mm`
}
