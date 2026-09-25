/**
 * The triangle-adjacency mesh MetaStream's vertex splits operate on, laid
 * out as Mts3Reader.dll lays it out (design/new/adf-mts-decoder.md §2).
 *
 * Faces are numbered in creation order. Face `f` has vertices
 * `v[f][0..2]` and, across the edge opposite vertex `i`, a neighbour link
 * `n[f][i]`. Links are tagged half-edges `t = face * 4 + edge`: half-edge
 * `(f, i)` runs `v[f][i+1] → v[f][i+2]` and its twin is `n[f][i]`. Each
 * vertex keeps an anchor, one outgoing half-edge, or −1 with no faces.
 *
 * The split decoder's choices index into this structure (a vertex's ring
 * order, where its ring starts, which wedge a face goes in), so it has to
 * match the DLL's link surgery exactly, not just its topology. Each
 * operation below names the DLL routine it reproduces.
 */


/** `(i + 2) % 3`: the DLL's `0x12 >> (i * 2) & 3` table. */
export const PRV = [2, 0, 1]
/** `(i + 1) % 3`: the DLL's `2 >> ((i ^ 1) & 3)` table. */
export const NXT = [1, 2, 0]
export const NONE = -1


/** A growable mesh of the shape above. */
export default class SplitMesh {
  /**
   * Empty: ADF streams have an empty base mesh.
   *
   * @param {number} [walkBudget] total ring-walk steps allowed over the
   *   whole decode (see `checkWalk`)
   */
  constructor(walkBudget = Infinity) {
    this.walkBudget = walkBudget
    this.v = new Int32Array(3 * 64)
    this.n = new Int32Array(3 * 64)
    this.faceCount = 0
    this.anchors = []
    this.vertexCount = 0
  }


  /** @return {number} the new vertex's index (`0x1181ad40`) */
  newVertex() {
    this.anchors.push(NONE)
    return this.vertexCount++
  }


  /** @return {number} the new face's index (`0x1181ade0`) */
  newFace() {
    if (3 * (this.faceCount + 1) > this.v.length) {
      const v = new Int32Array(this.v.length * 2)
      v.set(this.v)
      this.v = v
      const n = new Int32Array(this.n.length * 2)
      n.set(this.n)
      this.n = n
    }
    const f = this.faceCount++
    this.v.fill(NONE, 3 * f, (3 * f) + 3)
    this.n.fill(NONE, 3 * f, (3 * f) + 3)
    return f
  }


  /**
   * The next outgoing half-edge around the same vertex: the twin of the
   * half-edge that comes into it in the same face.
   *
   * @param {number} h outgoing half-edge
   * @return {number}
   */
  step(h) {
    return this.n[(3 * (h >> 2)) + PRV[h & 3]]
  }


  /**
   * Every walk around a vertex must close within this many steps. A valid
   * stream always does; a corrupt one can link half-edges into a cycle that
   * never returns, and without the bound the decode would hang the page.
   *
   * @return {number}
   */
  walkLimit() {
    return (3 * this.faceCount) + 3
  }


  /**
   * @param {number} h the half-edge a walk has reached
   * @param {number} steps how many steps it has taken
   * @return {number} `h`
   */
  checkWalk(h, steps) {
    if (steps > this.walkLimit() || !(h >= 0)) {
      throw new Error('mts: corrupt stream (a vertex ring does not close)')
    }
    // Each walk is bounded, but a split costs O(valence) and a crafted
    // stream can grow one vertex's valence by 1 per split, so the total is
    // quadratic in stream length (~1 minute for 100 KB). The decoder sets a
    // budget proportional to the stream's bits instead.
    if (--this.walkBudget < 0) {
      throw new Error('mts: corrupt stream (too much ring walking for its length)')
    }
    return h
  }


  /**
   * `0x1181a910`: where a vertex's ring starts, which is at the half-edge
   * whose face was created last. The anchor only picks a starting point for
   * the search.
   *
   * @param {number} vertex
   * @return {number} a half-edge, or NONE for a vertex with no faces
   */
  ringStart(vertex) {
    const h0 = this.anchors[vertex]
    if (h0 === NONE) {
      return NONE
    }
    let best = h0
    let steps = 1
    for (let h = this.step(h0); h !== h0; h = this.step(h)) {
      this.checkWalk(h, steps++)
      if ((h >> 2) > (best >> 2)) {
        best = h
      }
    }
    return best
  }


  /**
   * `0x1180df70`
   *
   * @param {number} h
   * @return {number} how many half-edges the ring through `h` has
   */
  valence(h) {
    let count = 1
    for (let x = this.step(h); x !== h; x = this.step(x)) {
      this.checkWalk(x, count++)
    }
    return count
  }


  /**
   * `0x1180dfb0`
   *
   * @param {number} h
   * @param {number} k
   * @return {number} `h` stepped `k` times
   */
  rotate(h, k) {
    for (let i = 0; i < k; i++) {
      h = this.step(h)
    }
    return h
  }


  /**
   * @param {number} t tagged half-edge
   * @return {number} the link slot `t` names
   */
  slot(t) {
    return (3 * (t >> 2)) + (t & 3)
  }


  /**
   * @param {number} t
   * @return {number} the vertex a half-edge starts from
   */
  tail(t) {
    return this.v[(3 * (t >> 2)) + NXT[t & 3]]
  }


  /**
   * `0x1180dd60`: point each of the face's vertices' anchors at its
   * outgoing half-edge in the face.
   *
   * @param {number} f
   */
  anchorFace(f) {
    this.anchors[this.v[3 * f]] = (4 * f) + 2
    this.anchors[this.v[(3 * f) + 1]] = 4 * f
    this.anchors[this.v[(3 * f) + 2]] = (4 * f) + 1
  }
}


/**
 * @param {number} t
 * @return {number} the half-edge before `t` in its face
 */
export function prevTag(t) {
  return (t & ~3) | PRV[t & 3]
}


/**
 * @param {number} t
 * @return {number} the half-edge after `t` in its face
 */
export function nextTag(t) {
  return (t & ~3) | NXT[t & 3]
}
