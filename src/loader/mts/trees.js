import BitReader from './bitstream'


/**
 * Coordinate trees: how MetaStream codes each quantized coordinate with raw
 * bits, no arithmetic coding (design/new/adf-mts-decoder.md §2.2).
 *
 * A tree covers an integer range `[lo, hi)`. Each node splits it into
 * `[.., node.hi)` (bit 0, go left) and `[node.lo, ..)` (bit 1, go right). The
 * values in between, `[node.hi, node.lo)`, never occur in the stream, so the
 * code spends no bits on them. Past the leaves, plain bisection finishes the
 * value. The encoder shapes the tree to the value histogram, so it doubles
 * as a prefix code.
 */


/**
 * Read a tree's range and shape (`0x11822840`).
 *
 * @param {BitReader} bs
 * @return {{lo: number, hi: number, root: ?object}}
 */
export function readTree(bs) {
  // The sign bit comes first but applies to the magnitude read after it.
  const negative = bs.read1()
  const magnitude = bs.readUInt()
  const lo = negative ? -magnitude : magnitude
  const hi = lo + bs.readUInt()
  if (hi - lo < 1) {
    throw new Error('mts: invalid coordinate range')
  }
  return {lo, hi, root: readNode(bs, lo, hi)}
}


/**
 * `0x118226c0`. The DLL recurses into the left child and loops for the right
 * one; the recursion here is equivalent and the trees are 16 nodes deep at
 * most in practice.
 *
 * @param {BitReader} bs
 * @param {number} lo
 * @param {number} hi
 * @return {object|null} `{lo, hi, left, right}`
 */
function readNode(bs, lo, hi) {
  if (hi - lo <= 2 || !bs.read1()) {
    return null
  }
  const cutLo = bisect(bs, lo, hi)
  const cutHi = bisect(bs, cutLo, hi)
  const node = {lo: cutHi, hi: cutLo, left: null, right: null}
  node.left = readNode(bs, lo, cutLo)
  node.right = readNode(bs, cutHi, hi)
  return node
}


/**
 * Narrow `[lo, hi)` to one value with one bit per halving. `>> 1` floors for
 * negative sums too, matching the DLL's `sar`.
 *
 * @param {BitReader} bs
 * @param {number} lo
 * @param {number} hi
 * @return {number}
 */
export function bisect(bs, lo, hi) {
  while (hi > lo + 1) {
    const mid = (lo + hi) >> 1
    if (bs.read1()) {
      lo = mid
    } else {
      hi = mid
    }
  }
  return lo
}


/**
 * Decode one integer from `tree` (`0x118228f0`).
 *
 * @param {{lo: number, hi: number, root: ?object}} tree
 * @param {BitReader} bs
 * @return {number}
 */
export function readTreeInt(tree, bs) {
  let lo = tree.lo
  let hi = tree.hi
  let node = tree.root
  while (lo < hi - 1 && node) {
    if (bs.read1()) {
      lo = node.lo
      node = node.right
    } else {
      hi = node.hi
      node = node.left
    }
  }
  return bisect(bs, lo, hi)
}
