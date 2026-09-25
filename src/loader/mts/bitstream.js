/**
 * The bit reader every MetaStream mesh decode goes through.
 *
 * One cursor is shared by everything: header fields, the raw-bit coordinate
 * trees and the arithmetic decoder all pull from the same position, in the
 * order the decode asks, so a port must keep that exact interleaving
 * (design/new/adf-mts-decoder.md §1). Bits are LSB-first within each byte,
 * and multi-bit fields are little-endian: bit `k` of a value is stream bit
 * `pos + k` (Mts3Reader.dll `0x1180ccb0`, `0x1180cbe0`).
 *
 * Reading past the end throws. The DLL's read-mode BitStream returns zeros
 * there instead, but no valid stream reads past its end (all 54 in the test
 * fixture stop at or before it), and the zeros would let a truncated or
 * corrupt stream keep decoding: the header's count-driven loops and the split
 * loop would spin through zeros instead of failing. The arithmetic decoder's
 * own zero tail is separate: `ArithDecoder` stops calling `read1` once its
 * budget is spent.
 */
export default class BitReader {
  /**
   * @param {Uint8Array} bytes
   * @param {number} [bitLength] defaults to all of `bytes`
   */
  constructor(bytes, bitLength = bytes.length * 8) {
    this.bytes = bytes
    this.pos = 0
    this.length = bitLength
  }


  /** @return {number} the next bit, 0 or 1 */
  read1() {
    const p = this.pos++
    if (p >= this.length) {
      throw new Error('mts: truncated stream (read past the end)')
    }
    return (this.bytes[p >> 3] >> (p & 7)) & 1
  }


  /**
   * @param {number} n bit count, 0..32
   * @return {number} unsigned value
   */
  readBits(n) {
    let v = 0
    for (let k = 0; k < n; k++) {
      v += this.read1() * (2 ** k)
    }
    return v
  }


  /**
   * The DLL's `ReadUInt` (`0x11809ab0`): a 5-bit length `L`, then `L − 1`
   * bits `b`, giving `(1 << (L − 1)) | b`, or 0 when `L` is 0.
   *
   * @return {number}
   */
  readUInt() {
    const len = this.readBits(5)
    if (len === 0) {
      return 0
    }
    return (2 ** (len - 1)) + this.readBits(len - 1)
  }


  /**
   * The DLL's `ReadString` (`0x11809710`): a `readUInt` length, then 8-bit
   * characters. The DLL can byte-align before the characters, but only when
   * its caller asks, and no MetaStream mesh header does.
   *
   * @return {string}
   */
  readString() {
    const len = this.readUInt()
    let s = ''
    for (let k = 0; k < len; k++) {
      s += String.fromCharCode(this.readBits(8))
    }
    return s
  }


  /**
   * A float32 stored as its 32 raw bits.
   *
   * @return {number}
   */
  readFloat32() {
    FLOAT_VIEW.setUint32(0, this.readBits(32), true)
    return FLOAT_VIEW.getFloat32(0, true)
  }
}


const FLOAT_VIEW = new DataView(new ArrayBuffer(4))
