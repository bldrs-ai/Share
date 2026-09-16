import {estimateKey, settledEstimateBytes} from './exportEstimate'


/**
 * The Export tab's size-line wait, as a decision rather than as a poll.
 *
 * Both cases below are failures this harness actually had. The stale one cost
 * a red run (Draco compared against the Meshopt figure it had not yet
 * replaced); the equal-bytes one is the stall that replaced it — a wait keyed
 * on the byte count cannot see a new estimate that happens to weigh the same,
 * and two things in this codebase make that happen on purpose. `export.ts`
 * wraps this in `expect.poll`; the decision itself is what is worth pinning.
 */
describe('settledEstimateBytes', () => {
  const draco = estimateKey('draco', false, true, 'balanced')
  const none = estimateKey('none', false, true, 'balanced')
  // The figure as the DOM carries it: `data-bytes` is a string, and every
  // case here turns on two selections landing on the same one.
  const BYTES = '13084'
  const OTHER_BYTES = '9021'

  it('accepts the new estimate even when it weighs exactly what the last one did', () => {
    // Draco with no encoder falls back to the file as it is (#1842), so the
    // figure is the uncompressed one to the byte. Keyed on the count, this
    // wait never returns; keyed on the selection, it returns at once.
    expect(settledEstimateBytes(draco, BYTES, draco)).toBe(Number(BYTES))
  })

  it('rejects the previous selection\'s line, whatever it says', () => {
    // The stale render: the click has already moved the dropdown to Draco,
    // and for that one render the line still holds the None estimate. It is
    // excluded by its key — including when its figure differs, which is the
    // case a "has it changed?" wait would have accepted.
    expect(settledEstimateBytes(none, OTHER_BYTES, draco)).toBeNull()
    expect(settledEstimateBytes(none, BYTES, draco)).toBeNull()
  })

  it('rejects the pending line, and does not require ever seeing it', () => {
    // "Estimating…" replaces the size line outright, so there is no key to
    // read. Nothing here waits for that state: on a small fixture the encode
    // can finish inside one render and it is never observable.
    expect(settledEstimateBytes(null, null, draco)).toBeNull()
    expect(settledEstimateBytes(draco, null, draco)).toBeNull()
  })

  it('separates the two figures one estimate produces', () => {
    // The metadata toggle picks between `withMetadata` and `withoutMetadata`
    // without re-estimating, so the codec/portable half of the key cannot
    // tell them apart — and a fixture whose metadata weighed nothing would
    // put identical counts on both sides.
    const stripped = estimateKey('draco', false, false, 'balanced')
    expect(settledEstimateBytes(draco, BYTES, stripped)).toBeNull()
    expect(settledEstimateBytes(stripped, BYTES, stripped)).toBe(Number(BYTES))
  })

  it('separates one Quality rung from another at the same codec', () => {
    // Two rungs are two different files, and the ones that differ only in
    // Draco's encoder-effort pair can legitimately land on the same byte
    // count — measured, `encodeSpeed: 0` alone moved the Momentum fixture by
    // exactly 0.0% (#1848). Another pair a byte-keyed wait would stall on.
    const smallest = estimateKey('draco', false, true, 'smallest')
    expect(settledEstimateBytes(draco, BYTES, smallest)).toBeNull()
    expect(settledEstimateBytes(smallest, BYTES, smallest)).toBe(Number(BYTES))
  })

  it('separates portable from native for one codec', () => {
    // `rewriteGlbPortable` returns its input unchanged for a non-batched
    // artifact (`export/glbPortable.js`), so this pair is another that can
    // legitimately land on the same byte count.
    const portable = estimateKey('none', true, true, 'balanced')
    expect(settledEstimateBytes(none, BYTES, portable)).toBeNull()
    expect(settledEstimateBytes(portable, BYTES, portable)).toBe(Number(BYTES))
  })
})
