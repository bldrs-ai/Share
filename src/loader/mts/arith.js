import BitReader from './bitstream'


/**
 * MetaStream's arithmetic decoder and adaptive frequency models: a 16-bit
 * Witten–Neal–Cleary style coder with half/quarter scaling, transcribed from
 * Mts3Reader.dll (design/new/adf-mts-decoder.md §2.1 has the pseudo-code and
 * addresses). Every division truncates and every product fits in int32
 * (16-bit range × totals capped at 0x3fff), so plain JS numbers are exact.
 */


const HALF = 0x8000
const QUARTER = 0x4000
const THREE_QUARTERS = 0xc000
const RESCALE_THRESHOLD = 0x3fff


/**
 * An adaptive model over symbols `0..n−1`.
 *
 * `cum[k]` is the total frequency of symbols `k..n−1`: accumulated from the
 * TOP, so `cum[0]` is the model total and `cum[n]` is a zero sentinel.
 * Symbol `k` owns `[cum[k+1], cum[k])` of the coder's range.
 */
export class AdaptiveModel {
  /**
   * @param {number} n alphabet size
   * @param {number} [incShift] increment is `(total >> incShift) + 1`
   * @param {number} [rescaleShift] rescale divides by `2 ** rescaleShift`
   */
  constructor(n, incShift = 7, rescaleShift = 7) {
    this.n = n
    this.incShift = incShift
    this.rescaleShift = rescaleShift
    // Every model starts flat: frequency 1 per symbol.
    this.freq = new Int32Array(n + 1)
    this.cum = new Int32Array(n + 1)
    for (let k = n - 1; k >= 0; k--) {
      this.freq[k] = 1
      this.cum[k] = this.cum[k + 1] + 1
    }
  }


  /**
   * The largest `k` with `cum[k] > target` (`0x11822b10`, binary search).
   *
   * @param {number} target
   * @return {number}
   */
  lookup(target) {
    let lo = 0
    let hi = this.n
    while (hi > lo + 1) {
      const mid = (lo + hi) >> 1
      if (this.cum[mid] > target) {
        lo = mid
      } else {
        hi = mid
      }
    }
    return lo
  }


  /**
   * Count one more `s` (`0x11822a70`). Callers decode and update
   * separately; the DLL does too.
   *
   * @param {number} s
   */
  update(s) {
    const inc = (this.cum[0] >> this.incShift) + 1
    this.freq[s] += inc
    for (let k = s; k >= 0; k--) {
      this.cum[k] += inc
    }
    if (this.cum[0] > RESCALE_THRESHOLD) {
      const half = 1 << (this.rescaleShift - 1)
      let acc = 0
      for (let k = this.n - 1; k >= 0; k--) {
        const f = this.freq[k]
        let scaled = (f + half) >> this.rescaleShift
        if (scaled === 0 && f !== 0) {
          scaled = 1
        }
        this.freq[k] = scaled
        acc += scaled
        this.cum[k] = acc
      }
    }
  }
}


/** The decoder state; it shares its BitReader with the raw-bit reads. */
export class ArithDecoder {
  /**
   * `0x11822b50`: seed `value` with 16 bits. `budget` caps how many bits
   * the coder may take from the stream in total; past it, it shifts in
   * zeros and leaves the cursor alone.
   *
   * @param {BitReader} bs
   * @param {number} budget
   */
  constructor(bs, budget) {
    this.bs = bs
    this.low = 0
    this.range = 0x10000
    this.value = 0
    this.bitsLeft = budget
    for (let k = 0; k < 16; k++) {
      this.value = (this.value << 1) | this.nextBit()
    }
  }


  /** @return {number} */
  nextBit() {
    const b = this.bitsLeft > 0 ? this.bs.read1() : 0
    this.bitsLeft--
    return b
  }


  /** `0x11822bd0` */
  renorm() {
    // A valid stream never narrows the range to nothing; a corrupt one can,
    // and then the loop below would never exit.
    if (this.range <= 0) {
      throw new Error('mts: corrupt stream (arithmetic range collapsed)')
    }
    for (;;) {
      if (this.low >= HALF) {
        this.low -= HALF
      } else if (this.low + this.range <= HALF) {
        // Wholly in the lower half: nothing to subtract.
      } else if (this.low >= QUARTER && this.low + this.range <= THREE_QUARTERS) {
        this.value ^= QUARTER
        this.low -= QUARTER
      } else {
        return
      }
      this.low <<= 1
      this.range <<= 1
      this.value = ((this.value & ~HALF) << 1) | this.nextBit()
    }
  }


  /**
   * `0x11822ca0`. The caller updates the model afterwards.
   *
   * @param {AdaptiveModel} m
   * @return {number}
   */
  symbol(m) {
    const total = m.cum[0]
    const range = this.range
    const target = Math.floor((((this.value - this.low + 1) * total) - 1) / range)
    const s = m.lookup(target)
    const lo = m.cum[s + 1]
    const hi = m.cum[s]
    this.range = Math.trunc((hi - lo) * range / total)
    this.low += Math.trunc(lo * range / total)
    this.renorm()
    return s
  }


  /**
   * `0x11822d50`: a symbol from `[0, min(limit, n))` only, with the
   * model's probabilities renormalized over that prefix.
   *
   * @param {AdaptiveModel} m
   * @param {number} limit
   * @return {number}
   */
  symbolBounded(m, limit) {
    const cap = Math.min(limit, m.n)
    const base = m.cum[cap]
    const total = m.cum[0] - base
    const range = this.range
    const target = Math.floor((((this.value - this.low + 1) * total) - 1) / range) + base
    const s = m.lookup(target)
    const lo = m.cum[s + 1]
    const hi = m.cum[s]
    this.range = Math.trunc((hi - lo) * range / total)
    this.low += Math.trunc((lo - base) * range / total)
    this.renorm()
    return s
  }


  /**
   * `0x11822d10`: a value in `[0, n)`, all equally likely.
   *
   * @param {number} n
   * @return {number}
   */
  uniform(n) {
    const range = this.range
    const t = Math.floor((((this.value - this.low + 1) * n) - 1) / range)
    this.range = Math.trunc(range / n)
    this.low += Math.trunc(t * range / n)
    this.renorm()
    return t
  }
}
