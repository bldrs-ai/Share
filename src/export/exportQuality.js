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
// The rungs are a FIDELITY ladder, and the parentheticals on their labels —
// larger / medium / small — are a HINT about where that lands in bytes, not a
// guarantee. The hint holds on EDGEBREAKER, which is what the default
// batched-native artifact takes (below: −8.6% and −22.1%, each against the
// shipped setting before there was a control). It does not hold universally:
// Draco's speed pair is an encoder-effort knob whose payoff is model-shaped,
// and under SEQUENTIAL Balanced measured +0.5% LARGER than Best on Momentum
// and +21.5% on the small jest fixture. So the labels are read against the
// real per-codec byte counts the dropdown shows beside them
// (`export/codecSizes.js`), which are measured, not predicted — and no test
// here asserts a monotone ladder, because there is not one. What the ladder
// IS monotone in is fidelity, which is the axis the caption under the size
// line quantifies.
//
// ## Why the ladder stops at Reduced
//
// THREE rungs, and the two sweep tables below are the whole reason there are
// not five. #1852 added `squashed` (POSITION 10 / NORMAL 6) and `smooshed`
// (POSITION 8 / NORMAL 4) on the strength of the Momentum figures — −34.2%
// and −46.1% against Reduced's baseline. #1854 removed them again, and the
// tables are kept rather than deleted because they are the evidence for where
// the ladder now ends and for why P7 N3 was never offered at all. Without
// them the next person re-derives a coarser rung and re-learns this.
//
// What the owner measured on **Snowdon** (Autodesk's large IFC demo, 83.2 MB
// `.ifc` → 63.7 MB uncompressed GLB) — which is the model CLASS this feature
// is sold on, where Momentum is a 1.96 MB fixture:
//
//   Draco    Best 25.1  Balanced 24.5  Reduced 23.9  Squashed 23.0  Smooshed 22.0 MB
//   Meshopt       49.5           38.7          38.7           38.7           38.7 MB
//
// The entire Draco ladder is **−12.4%** there, against −46.1% on Momentum,
// and visible artifacts appear at the coarsest rung. Meshopt is flat across
// four rungs, exactly as `isDracoOnlyRung` below already said it would be.
// Two lossy rungs buying 8% between them, for damage the user can see, is not
// a trade worth offering.
//
// ## Where the bytes actually are (#1854), which matters more than the rungs
//
// With metadata off that 22.0 MB Snowdon file is 16.7 MB, and **bzip2 of it
// is 2.8 MB — 6×.** Draco output is entropy-coded and should be
// near-incompressible; measured per chunk on real batched exports, the JSON
// chunk gzips 7.5–9.8×, the `BLDRS_*` payloads 1.0× (they are already gzipped
// internally) and the Draco streams ~1× at real volumes. So a 6× whole-file
// ratio means almost none of that 16.7 MB IS Draco output. Solving the
// two-term model — incompressible `D` plus ~10×-compressible `R`, `D + R =
// 16.7`, `D + R/10 = 2.8` — gives:
//
//   ≈1.3 MB of compressed geometry.  ≈15.4 MB of CONTAINER.
//
// The container is the glTF JSON node graph plus the raw float32 instance
// transforms (`TRANSLATION` 12 B + `ROTATION` 16 B + `SCALE` 12 B = 40 B per
// instance), which `EXT_mesh_gpu_instancing` puts permanently out of Draco's
// reach — Draco encodes mesh primitives and cannot see an instancing
// accessor. Every rung in this table has been tuning that 1.3 MB slice. That
// is the entire explanation for the 12%, and it is why the work moved to
// compressing the CONTAINER: losslessly, in `export/glbGzip.js` (#1854),
// which beats this whole axis by ~6× at zero fidelity cost, and structurally
// in #1853.
//
// ## The measurements
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
// And the bit sweep past Reduced, on the same model and the same encoders,
// EDGEBREAKER / SEQUENTIAL. Everything below the rule is measured and NOT
// shipped; it is what "the ladder stops here" cost:
//
//   P12 N8 (Reduced)  194,932 / 643,520 B     bound  4.65 mm, nrm  0.91°
//   ------------------------------------------------------------------
//   P12 N6            172,984 / 616,896 B   −11.3% / −4.1%, SAME bound
//   P10 N6 (was       164,616 / 591,232 B   −15.6% / −8.1%, bound 18.62 mm
//     `squashed`)
//   P9  N6            162,480 / 580,140 B   −16.6% / −9.8%, bound 37.28 mm
//   P10 N5            153,236 / 578,424 B   −21.4% / −10.1%, nrm  6.77°
//   P8  N5            147,456 / 557,472 B   −24.4% / −13.4%, bound 74.72 mm
//   P10 N4            142,052 / 565,636 B   −27.1% / −12.1%, nrm 13.81°
//   P8  N4 (was       134,748 / 544,684 B   −30.9% / −15.4%, bound 74.72 mm
//     `smooshed`)
//   P7  N3            117,496 / 521,812 B   −39.7% / −18.9%, nrm 34.29°
//   P2  N2             85,700 / 481,748 B   −56.0% / −25.1%, the floor
//
// Three readings in that sweep, and the first two are counter-intuitive.
// They are what says a coarser rung is not worth re-deriving:
//
//   - NORMAL, not POSITION, is where the bytes are. P12→P8 at NORMAL 8 buys
//     −4.8%; N8→N6 at POSITION 12 buys −11.3% and moves no vertex at all, and
//     NORMAL keeps paying — another 5.8 and 5.7 percentage points of the
//     Reduced baseline at N5 and N4 — long after POSITION has stopped.
//   - Past 10 bits POSITION stops paying. P10→P9 is −1.0% for DOUBLE the
//     positional error, P9→P8 another −1.3% for double again — and that error
//     is the number the caption quotes to the user. POSITION is therefore
//     spent only where a rung needs a visibly coarser SHAPE, not for bytes.
//   - The floor is connectivity. At P2 N2 — geometry destroyed — EDGEBREAKER
//     still needs 85,700 B of the original 194,932. Everything below about
//     −56% on this model is triangles, which no bit count touches. That is
//     the honest ceiling on this whole axis, and the decimation sub-issue of
//     #1831 (#1853) is what would move the floor itself; it is off the table
//     while `BLDRS_face_ids` indexes identity by triangle position.
//
// P7 N3 is the line the ladder was never going to cross even when it had five
// rungs: 34.29° of normal error is where shading stops describing the surface
// at all, so the model reads as blotchy rather than as coarse. What #1854
// establishes is that the two rungs ABOVE that line were not worth their
// damage either, once measured on a model the size this is sold for.
//
// `public/index.ifc` → GLB is the second model and shows the other limit: at
// 6,800 B it is JSON and header, so EVERY rung lands within 3% of every other
// (P12 N8 1,252 B, P10 N6 1,224 B, P8 N4 1,212 B) while the printed bound goes
// 18.19 mm → 72.80 mm → 292.07 mm over its single 86 m primitive. On a model
// that small the lossy rungs were all cost and no benefit — which is exactly
// what the measured size beside each codec in the dropdown tells the user,
// and the reason this module quotes no percentage in the UI.
//
// `TEX_COORD` and `COLOR` were swept too and are not named: Share's writers
// emit POSITION, NORMAL, `_EXPRESSID` and `_INSTANCEID` and nothing else
// (`viewer/ifc/flatMeshToBufferGeometry.js`, `batchedSubset.js`), so both
// buckets measured byte-for-byte identical on both models. A key that cannot
// move a byte on any artifact Share writes is a key the allowlist has to
// carry for nothing.
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
//     default artifact takes, so it rides on Balanced and on Reduced — but
//     see the note above about not promising a ladder.
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
//   - Anything at all for MESHOPT below `FILTER`. `EXTMeshoptCompression`'s
//     entire encoder surface in the pinned `@gltf-transform` 4.3.0 is
//     `{method: QUANTIZE | FILTER}` — the filter each attribute gets and the
//     bit depth it gets it at are hard-coded by attribute semantic in the
//     extension's own `getMeshoptFilter` (POSITION and TEXCOORD_0 → no
//     filter, NORMAL and TANGENT → octahedral at 8 bits), with no option
//     plumbed through. What `gltfpack` would reach for next is `quantize()`,
//     which is in `@gltf-transform/functions` and reorders geometry, so it is
//     off the table for `BLDRS_face_ids` (`glbCompression.js#transformGlb`).
//     The consequence is a real one and the UI says it rather than hiding it:
//     Reduced asks Meshopt for exactly what Balanced asks for and produces
//     exactly Balanced's bytes — see `isDracoOnlyRung`.
//
// Design: design/new/glb-export-premium.md §4.3.

/** Today's shipped fidelity: nothing about the file's geometry changes. */
export const QUALITY_BEST = 'best'
/** Highest fidelity, encoder tuned for size. The default. */
export const QUALITY_BALANCED = 'balanced'
/**
 * Fewer position/normal bits, at a millimetre cost the caption quotes — and
 * the last rung there is. The module doc has the sweep past it and the
 * Snowdon measurement that took the two coarser rungs back out (#1854).
 */
export const QUALITY_SMALLEST = 'smallest'

/** The choices the Export tab offers, in the order it offers them. */
export const QUALITY_LEVELS = [
  QUALITY_BEST,
  QUALITY_BALANCED,
  QUALITY_SMALLEST,
]

/**
 * What each choice is called on the control.
 *
 * Two names for one rung, and the divergence is deliberate: the ID is written
 * into export-history rows and estimate cache keys and has to keep meaning the
 * same thing across a rename, while the LABEL is a claim made to the user.
 * So `smallest` reads "Reduced (small)"; renaming the id would break rows
 * already recorded.
 *
 * The parenthetical is a size HINT, not a guarantee — the module doc above has
 * the SEQUENTIAL counter-examples, and the dropdown shows each codec's real
 * measured bytes beside it. What the words do promise, and what IS monotone,
 * is how much of the model's geometry survives. No rung carries the word
 * "lossy" any more: the two that did are gone (#1854), and every rung left
 * keeps the model visually intact — Reduced's own bound is 4.65 mm on
 * Momentum, which is a caption rather than a warning.
 */
export const QUALITY_LABELS = {
  [QUALITY_BEST]: 'Best (larger)',
  [QUALITY_BALANCED]: 'Balanced (medium)',
  [QUALITY_SMALLEST]: 'Reduced (small)',
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
  // The last rung. `isMeshoptFiltered` repeats Balanced's value because there
  // is nothing coarser to ask Meshopt for; `isDracoOnlyRung` is what makes the
  // panel say so. The bit sweep BELOW this row is in the module doc and stays
  // there un-shipped: P10 N6 and P8 N4 rode here through #1852 and came back
  // out in #1854, when the whole ladder measured −12.4% on a real large model.
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
 * Whether this rung asks MESHOPT for nothing a rung above it did not already
 * ask for — so under Meshopt it produces that rung's file, byte for byte.
 *
 * It is true of Reduced, the only rung below Balanced, and it is a property
 * of the library rather than of this table: `EXTMeshoptCompression`'s whole encoder
 * surface in the pinned `@gltf-transform` 4.3.0 is `{method}`, with two
 * values, and Balanced already spends the coarser one (see the module doc's
 * last "deliberately NOT here" bullet). The panel says so in the fidelity
 * caption rather than shipping a rung that silently changes nothing — the
 * codec sweep already shows the real per-codec bytes, so the user would SEE
 * Meshopt not moving, but an unexplained no-op teaches people the control is
 * broken.
 *
 * Derived from the table, not hard-coded to a rung name, so that a future
 * rung which does reach a new Meshopt setting stops claiming this by itself.
 *
 * @param {string} quality One of `QUALITY_LEVELS`
 * @return {boolean}
 */
export function isDracoOnlyRung(quality) {
  const level = isQualityLevel(quality) ? quality : QUALITY_DEFAULT
  const {isMeshoptFiltered} = QUALITY_SETTINGS[level]
  return QUALITY_LEVELS.find((l) => QUALITY_SETTINGS[l].isMeshoptFiltered === isMeshoptFiltered) !== level
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
