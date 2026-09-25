import {ArithDecoder} from './arith'
import BitReader from './bitstream'
import {UnsupportedMtsError, readHeader} from './header'
import SplitMesh, {NONE, NXT, PRV, nextTag, prevTag} from './mesh'
import {bisect, readTreeInt} from './trees'


// Total ring-walk steps allowed per stream bit (`SplitMesh#checkWalk`). The
// fixture's streams take at most 0.57; a vertex of valence 11 is their max.
const WALK_STEPS_PER_BIT = 64


/**
 * Decode one MetaStream progressive mesh: a header, then `splits` vertex
 * splits grown from an empty base mesh (design/new/adf-mts-decoder.md).
 *
 * This is a transcription of Mts3Reader.dll's `0x1181c5e0` and its plug-ins,
 * not a reinterpretation. Each decision the stream encodes is an index into
 * the DLL's own structures (a ring position, a sorted candidate list, a
 * recently-seen face flag), so the order of every read, and every link the
 * split rewrites, has to match. Comments name the DLL routine or address
 * each step comes from.
 *
 * @param {Uint8Array} payload the `mesh` stream's bytes
 * @param {object} [options] `onSplit(k, mesh)`, if given, sees the mesh
 *   after each split (tests compare it with the DLL's)
 * @return {{positions: Float32Array, indices: Uint32Array, faceFlags: Uint32Array,
 *   quantized: Int32Array, bitsRead: number, bitLength: number}} positions in the
 *   stream's units (metres for ADF), indexed by vertex; `indices` and
 *   `faceFlags` are per face, newest face first, wound as the stream winds
 *   them (not necessarily outward)
 */
export function decodeMesh(payload, {onSplit} = {}) {
  const bs = new BitReader(payload)
  const header = readHeader(bs)
  const coder = new ArithDecoder(bs, header.arithBudget)
  const models = header.models
  const mesh = new SplitMesh(WALK_STEPS_PER_BIT * bs.length)
  const quant = header.position
  const nVerts = header.counts.vertices
  const qint = new Int32Array(3 * nVerts)
  const positions = new Float32Array(3 * nVerts)
  const faceFlags = []
  // Face-flag plug-in state (0x118147f0): every distinct new value, and the
  // values around the current split vertex.
  const flagDictionary = []
  let recentFlags = []

  const value = (m) => {
    const s = coder.symbol(m.model)
    m.model.update(s)
    return s + m.offset
  }
  const bounded = (m, limit) => {
    const s = coder.symbolBounded(m.model, limit - m.offset)
    m.model.update(s)
    return s + m.offset
  }
  const rawUniform = (n) => bisect(bs, 0, n) // 0x1181b500

  /**
   * Position plug-in (0x11819790): `vertex` relative to `ref`, or absolute.
   * The DLL appends positions in call order and indexes them by vertex, so
   * calls must come in vertex order, which every caller below guarantees.
   *
   * @param {number} ref
   * @param {number} vertex
   */
  const decodePosition = (ref, vertex) => {
    if (vertex >= nVerts) {
      throw new Error('mts: more vertices than the header declares')
    }
    for (let a = 0; a < 3; a++) {
      const q = ref === NONE ?
        readTreeInt(header.absoluteTrees[a], bs) :
        qint[(3 * ref) + a] + readTreeInt(header.deltaTrees[a], bs)
      qint[(3 * vertex) + a] = q
      positions[(3 * vertex) + a] = Math.fround((q * quant.scale[a]) + quant.offset[a])
    }
  }

  /**
   * Face-flag plug-in's per-split setup (0x118146f0): the flags of the
   * faces around the split vertex, in ring order, consecutive repeats
   * dropped.
   *
   * @param {number} vertex NONE when the split vertex is itself new
   */
  const collectRecentFlags = (vertex) => {
    recentFlags = []
    if (vertex === NONE) {
      return
    }
    const h0 = mesh.ringStart(vertex)
    // The DLL's "nothing yet" is −1 compared unsigned, so an all-ones flag
    // right at the start is dropped too; keep that.
    let last = 0xffffffff
    let h = h0
    let steps = 0
    do {
      const flag = faceFlags[h >> 2]
      if (flag !== last) {
        recentFlags.push(flag)
        last = flag
      }
      h = mesh.checkWalk(mesh.step(h), ++steps)
    } while (h !== h0)
  }

  /**
   * Face-flag plug-in, per new face (0x118147f0): a symbol picks a recent
   * flag (negative), a brand new one read raw (zero), or an earlier new one
   * (positive).
   *
   * @param {Array<number>} faces
   */
  const decodeFaceFlags = (faces) => {
    for (let k = 0; k < faces.length; k++) {
      const choice = value(models.faceFlag)
      let flag
      if (choice < 0) {
        const idx = choice + recentFlags.length
        if (idx < 0 || idx >= recentFlags.length) {
          throw new Error('mts: face flag refers past the recent list')
        }
        flag = recentFlags[idx]
      } else {
        if (choice === 0) {
          flag = bs.readBits(32)
          flagDictionary.push(flag)
        } else {
          if (choice > flagDictionary.length) {
            throw new Error('mts: face flag refers past the dictionary')
          }
          flag = flagDictionary[choice - 1]
        }
        recentFlags.push(flag)
      }
      faceFlags.push(flag)
    }
  }

  const commonSplit = () => {
    const vs = rawUniform(mesh.vertexCount)
    const vt = mesh.newVertex()
    collectRecentFlags(vs)
    const h0 = mesh.ringStart(vs)
    const valence = mesh.valence(h0)
    const h1 = mesh.rotate(h0, coder.uniform(valence))
    const e1 = prevTag(h1)
    const fan = bounded(models.fanSize, valence - 1)
    const e1Twin = mesh.n[mesh.slot(e1)]
    const e2 = prevTag(mesh.rotate(e1Twin, fan))
    const e2Twin = mesh.n[mesh.slot(e2)]
    const f1 = mesh.newFace()
    const f2 = mesh.newFace()
    const a = mesh.v[(3 * (e1 >> 2)) + NXT[e1 & 3]]
    const b = mesh.v[(3 * (e2 >> 2)) + NXT[e2 & 3]]
    if (a === vs || b === vs || a === vt || b === vt) {
      throw new Error('mts: degenerate split')
    }
    setFace(mesh, f2, [vs, a, vt], [e1Twin, (4 * f1) + 2, e1])
    setFace(mesh, f1, [vs, vt, b], [e2, e2Twin, (4 * f2) + 1])
    // 0x1180dcc0: point the old half-edges back at the new faces.
    mesh.n[mesh.slot(e1)] = (4 * f2) + 2
    mesh.n[mesh.slot(e1Twin)] = 4 * f2
    mesh.n[mesh.slot(e2Twin)] = (4 * f1) + 1
    mesh.n[mesh.slot(e2)] = 4 * f1
    // The fan between the new faces moves to vt.
    for (let h = e1Twin, steps = 1; h !== 4 * f1; h = mesh.checkWalk(mesh.step(h), steps++)) {
      mesh.v[(3 * (h >> 2)) + NXT[h & 3]] = vt
    }
    mesh.anchorFace(f2)
    mesh.anchorFace(f1)
    decodeFaceFlags([f1, f2])
    decodePosition(vs, vt)
  }

  const rareSplit = () => {
    const vertexCountBefore = mesh.vertexCount
    const existing = value(models.existingCount)
    const created = value(models.newCount)
    const cut = value(models.splitsExisting) !== 0
    // Vertices the new faces may use, kept sorted by index (0x1180dde0).
    const candidates = new SortedSet()
    for (let k = 0, idx = 0; k < existing; k++, idx++) {
      idx += rawUniform(vertexCountBefore - idx)
      candidates.add(idx)
    }
    const createdVertices = []
    for (let k = 0; k < created; k++) {
      createdVertices.push(mesh.newVertex())
    }
    const v = rawUniform(vertexCountBefore + created)
    const splitIsNew = v >= vertexCountBefore
    if (splitIsNew) {
      createdVertices.splice(createdVertices.indexOf(v), 1)
    }
    createdVertices.forEach((w) => candidates.add(w))
    const vt = mesh.newVertex()
    collectRecentFlags(splitIsNew ? NONE : v)
    if (!splitIsNew) {
      const h0 = mesh.ringStart(v)
      if (h0 === NONE) {
        throw new Error('mts: split vertex has no faces')
      }
      const valence = mesh.valence(h0)
      // 0x1180dbb0: the ring's vertices become candidates.
      let h = h0
      let steps = 0
      do {
        const f = 3 * (h >> 2)
        candidates.add(mesh.v[f + PRV[h & 3]])
        candidates.add(mesh.v[f + (h & 3)])
        h = mesh.checkWalk(mesh.step(h), ++steps)
      } while (h !== h0)
      if (cut) {
        const h1 = mesh.rotate(h0, coder.uniform(valence))
        const w = bounded(models.cutSize, valence)
        let e1 = prevTag(h1)
        const e2 = prevTag(mesh.rotate(h1, w))
        if (e1 === e2) {
          e1 = NONE
        }
        // 0x1180dd90: swapping two twin links splits v's ring in two.
        let r
        if (e1 === NONE) {
          r = nextTag(e2)
        } else {
          r = mesh.n[mesh.slot(e1)]
          mesh.n[mesh.slot(e1)] = mesh.n[mesh.slot(e2)]
          mesh.n[mesh.slot(e2)] = r
        }
        // 0x1181bb80: the half starting at r moves to vt.
        h = r
        steps = 0
        do {
          mesh.v[(3 * (h >> 2)) + NXT[h & 3]] = vt
          h = mesh.checkWalk(mesh.step(h), ++steps)
        } while (h !== r)
        mesh.anchors[v] = e1 === NONE ? NONE : nextTag(e1)
        mesh.anchors[vt] = nextTag(e2)
      }
    }
    const faceCount = value(models.faceCount)
    const firstOriented = bounded(models.firstOrientation, faceCount + 1)
    const faces = []
    for (let j = 0; j < faceCount; j++) {
      const f = mesh.newFace()
      faces.push(f)
      const x = candidates.at(coder.uniform(candidates.size))
      if (x === vt || x === v) {
        throw new Error('mts: degenerate face')
      }
      const corners = j < firstOriented ? [v, vt, x] : [v, x, vt]
      mesh.v.set(corners, 3 * f)
      // 0x1181d218: insert each corner into a chosen wedge of its fan, or
      // close the face on itself there when the vertex has no faces yet.
      for (let i = 0; i < 3; i++) {
        const vertex = corners[i]
        const start = mesh.ringStart(vertex)
        let e
        if (start !== NONE) {
          e = prevTag(mesh.rotate(start, coder.uniform(mesh.valence(start))))
          mesh.n[(3 * f) + NXT[i]] = mesh.n[mesh.slot(e)]
        } else {
          e = (4 * f) + NXT[i]
        }
        mesh.n[mesh.slot(e)] = (4 * f) + PRV[i]
        mesh.anchors[vertex] = (4 * f) + PRV[i]
      }
    }
    decodeFaceFlags(faces)
    // 0x1181e730: vertices in index order, predicted from the split vertex.
    if (splitIsNew) {
      let k = 0
      for (; k < createdVertices.length && createdVertices[k] < v; k++) {
        decodePosition(NONE, createdVertices[k])
      }
      decodePosition(NONE, v)
      for (; k < createdVertices.length; k++) {
        decodePosition(v, createdVertices[k])
      }
    } else {
      createdVertices.forEach((w) => decodePosition(v, w))
    }
    decodePosition(v, vt)
  }

  for (let k = 0; k < header.counts.splits; k++) {
    const common = value(models.common) !== 0
    if (value(models.extraFlag) !== 0) {
      throw new UnsupportedMtsError('split extra records')
    }
    if (common) {
      commonSplit()
    } else {
      rareSplit()
    }
    if (onSplit) {
      onSplit(k, mesh)
    }
  }

  const nFaces = mesh.faceCount
  if (mesh.vertexCount !== nVerts || nFaces !== header.counts.faces) {
    throw new Error(`mts: decoded ${mesh.vertexCount} vertices / ${nFaces} faces, ` +
      `header says ${nVerts} / ${header.counts.faces}`)
  }
  // The DLL hands faces over newest first (its take-mesh walk, 0x11814940);
  // emit them that way so output matches it face for face.
  const indices = new Uint32Array(3 * nFaces)
  const flags = new Uint32Array(nFaces)
  for (let f = 0; f < nFaces; f++) {
    const g = nFaces - 1 - f
    indices.set(mesh.v.subarray(3 * g, (3 * g) + 3), 3 * f)
    flags[f] = faceFlags[g]
  }
  return {
    positions,
    indices,
    faceFlags: flags,
    quantized: qint,
    bitsRead: bs.pos,
    bitLength: bs.length,
  }
}


/**
 * @param {SplitMesh} mesh
 * @param {number} f
 * @param {Array<number>} vertices
 * @param {Array<number>} links
 */
function setFace(mesh, f, vertices, links) {
  mesh.v.set(vertices, 3 * f)
  mesh.n.set(links, 3 * f)
}


/** Ascending integers without duplicates; small, so insertion is linear. */
class SortedSet {
  /** */
  constructor() {
    this.items = []
  }


  /** @return {number} */
  get size() {
    return this.items.length
  }


  /** @param {number} x */
  add(x) {
    let k = this.items.length
    while (k > 0 && this.items[k - 1] > x) {
      k--
    }
    if (k > 0 && this.items[k - 1] === x) {
      return
    }
    this.items.splice(k, 0, x)
  }


  /**
   * @param {number} k
   * @return {number}
   */
  at(k) {
    return this.items[k]
  }
}
