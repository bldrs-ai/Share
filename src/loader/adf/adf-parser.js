/**
 * Parser for Align Technology binary ADF files
 * (`AlignDataFile ( bin )` / ClinCheck .adf).
 *
 * Layout after the text header:
 *   { fieldName <uint32le size> <payload> fieldName <size> <payload> ... }
 *
 * Payload is either a nested `{...}` object (or a sequence of them), or a
 * raw blob (string / int / float / vec3 / quaternion / bytes).
 */

const IDENT = /[A-Za-z0-9+._\-:/<>*?#]/
const HEADER_RE = /^AlignDataFile \( bin \)\nVersion ([^\n]+)\n\n/

export class ADFParseError extends Error {
  constructor(message, position) {
    super(message)
    this.name = 'ADFParseError'
    this.position = position
  }
}

function peekName(bytes, pos, end) {
  if (pos >= end || !IDENT.test(String.fromCharCode(bytes[pos]))) {
    return null
  }
  let i = pos
  while (i < end && IDENT.test(String.fromCharCode(bytes[i]))) {
    i++
  }
  if (i < end && bytes[i] === 0x20) {
    return new TextDecoder('ascii').decode(bytes.subarray(pos, i))
  }
  return null
}

function viewAt(bytes, pos) {
  return new DataView(bytes.buffer, bytes.byteOffset + pos)
}

function parseObject(bytes, pos, end) {
  if (pos >= end || bytes[pos] !== 0x7b) {
    throw new ADFParseError(`expected '{' at ${pos}`, pos)
  }
  pos += 1
  const fields = []
  while (pos < end && bytes[pos] !== 0x7d) {
    if (bytes[pos] === 0x7b) {
      const nested = parseObject(bytes, pos, end)
      fields.push({name: null, value: nested.value})
      pos = nested.pos
      continue
    }
    const name = peekName(bytes, pos, end)
    if (name == null) {
      throw new ADFParseError(`expected field name at ${pos}`, pos)
    }
    pos += name.length + 1
    if (pos + 4 > end) {
      throw new ADFParseError(`truncated size for ${name} at ${pos}`, pos)
    }
    const size = viewAt(bytes, pos).getUint32(0, true)
    pos += 4
    if (pos + size > end) {
      throw new ADFParseError(
        `field ${name} size ${size} overruns buffer at ${pos}`,
        pos,
      )
    }
    const payload = bytes.subarray(pos, pos + size)
    fields.push({name, value: decodeValue(payload)})
    pos += size
  }
  if (pos >= end || bytes[pos] !== 0x7d) {
    throw new ADFParseError(`unclosed object at ${pos}`, pos)
  }
  return {value: fieldsToObject(fields), pos: pos + 1}
}

function fieldsToObject(fields) {
  const obj = {__type: 'object'}
  const order = []
  for (const {name, value} of fields) {
    const key = name == null ? '_anon' : name
    if (!Object.prototype.hasOwnProperty.call(obj, key)) {
      obj[key] = value
      order.push(key)
    } else if (Array.isArray(obj[key])) {
      obj[key].push(value)
    } else {
      obj[key] = [obj[key], value]
    }
  }
  obj.__keys = order
  return obj
}

function isPrintableAscii(bytes) {
  if (bytes.length === 0) {
    return false
  }
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]
    if (b < 0x20 || b > 0x7e) {
      return false
    }
  }
  return true
}

function skipPrefix(bytes) {
  // Some values store a 4/8/12-byte header (often zeros) before a nested object.
  const n = Math.min(16, bytes.length)
  for (let skip = 4; skip <= n; skip += 4) {
    if (bytes[skip] === 0x7b && bytes[bytes.length - 1] === 0x7d) {
      let zeros = true
      for (let i = 0; i < skip; i++) {
        if (bytes[i] !== 0) {
          zeros = false
          break
        }
      }
      if (zeros) {
        return skip
      }
    }
  }
  return 0
}

function parseObjectBody(bytes, pos, end) {
  const fields = []
  while (pos < end && bytes[pos] !== 0x7d) {
    if (bytes[pos] === 0x7b) {
      const nested = parseObject(bytes, pos, end)
      fields.push({name: null, value: nested.value})
      pos = nested.pos
      continue
    }
    const name = peekName(bytes, pos, end)
    if (name == null) {
      throw new ADFParseError(`expected field name at ${pos}`, pos)
    }
    pos += name.length + 1
    if (pos + 4 > end) {
      throw new ADFParseError(`truncated size for ${name}`, pos)
    }
    const size = viewAt(bytes, pos).getUint32(0, true)
    pos += 4
    if (pos + size > end) {
      throw new ADFParseError(`field ${name} overruns`, pos)
    }
    fields.push({name, value: decodeValue(bytes.subarray(pos, pos + size))})
    pos += size
  }
  return {value: fieldsToObject(fields), pos}
}

function decodeValue(bytes) {
  const n = bytes.length
  if (n === 0) {
    return null
  }

  const start = bytes[0] === 0x7b ? 0 : skipPrefix(bytes)
  if (bytes[start] === 0x7b && bytes[n - 1] === 0x7d) {
    try {
      const items = []
      let pos = start
      while (pos < n) {
        const parsed = parseObject(bytes, pos, n)
        items.push(parsed.value)
        pos = parsed.pos
      }
      if (pos === n) {
        return items.length === 1 ? items[0] : items
      }
    } catch {
      // fall through
    }
  }

  if (peekName(bytes, 0, n)) {
    try {
      const body = parseObjectBody(bytes, 0, n)
      if (body.pos === n) {
        return body.value
      }
    } catch {
      // fall through to primitive decode
    }
  }

  const dv = new DataView(bytes.buffer, bytes.byteOffset, n)
  if (n === 1) {
    return bytes[0]
  }
  if (n === 4) {
    const i = dv.getInt32(0, true)
    const f = dv.getFloat32(0, true)
    return {i32: i, f32: f}
  }
  if (n === 8) {
    return {
      i32: [dv.getInt32(0, true), dv.getInt32(4, true)],
      f32: [dv.getFloat32(0, true), dv.getFloat32(4, true)],
      f64: dv.getFloat64(0, true),
    }
  }
  if (n === 12) {
    return {
      vec3: [dv.getFloat32(0, true), dv.getFloat32(4, true), dv.getFloat32(8, true)],
    }
  }
  if (n === 16) {
    return {
      vec4: [
        dv.getFloat32(0, true),
        dv.getFloat32(4, true),
        dv.getFloat32(8, true),
        dv.getFloat32(12, true),
      ],
    }
  }
  if (isPrintableAscii(bytes)) {
    return new TextDecoder('ascii').decode(bytes)
  }
  if (n >= 8 && n % 4 === 0 && n <= 8 + 4096 * 12) {
    const count = dv.getUint32(0, true)
    if (count > 0 && 4 + count * 12 === n) {
      const pts = []
      for (let i = 0; i < count; i++) {
        const o = 4 + i * 12
        pts.push([dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true)])
      }
      return {points: pts}
    }
    if (count > 0 && 4 + count * 24 === n) {
      const pts = []
      for (let i = 0; i < count; i++) {
        const o = 4 + i * 24
        pts.push([dv.getFloat64(o, true), dv.getFloat64(o + 8, true), dv.getFloat64(o + 16, true)])
      }
      return {points: pts}
    }
    if (count > 0 && 4 + count * 4 === n) {
      const idx = []
      for (let i = 0; i < count; i++) {
        idx.push(dv.getInt32(4 + i * 4, true))
      }
      return {ints: idx}
    }
  }
  return {bytes: bytes.slice(), size: n}
}

export function asList(value) {
  if (value == null) {
    return []
  }
  return Array.isArray(value) && value[0]?.__type === 'object' ? value : Array.isArray(value) ? value : [value]
}

export function i32(value, fallback = 0) {
  if (value == null) {
    return fallback
  }
  if (typeof value === 'number') {
    return value
  }
  if (typeof value === 'object' && typeof value.i32 === 'number') {
    return value.i32
  }
  return fallback
}

export function f32(value, fallback = 0) {
  if (value == null) {
    return fallback
  }
  if (typeof value === 'number') {
    return value
  }
  if (typeof value === 'object' && typeof value.f32 === 'number') {
    return value.f32
  }
  return fallback
}

export function vec3(value) {
  if (!value) {
    return null
  }
  if (Array.isArray(value) && value.length === 3) {
    return value
  }
  if (value.vec3) {
    return value.vec3
  }
  if (value.translation) {
    return vec3(value.translation)
  }
  return null
}

export function quatWxyz(value) {
  // ADF stores quaternions as (w, x, y, z). Identity is (1,0,0,0).
  if (!value) {
    return null
  }
  if (value.vec4) {
    return value.vec4
  }
  if (value.rotation) {
    return quatWxyz(value.rotation)
  }
  return null
}

export function transformOf(obj) {
  if (!obj || obj.__type !== 'object') {
    return null
  }
  const t = vec3(obj.translation)
  const q = quatWxyz(obj.rotation)
  if (!t && !q) {
    return null
  }
  return {
    translation: t || [0, 0, 0],
    rotation: q || [1, 0, 0, 0],
  }
}

export function str(value) {
  if (typeof value === 'string') {
    return value.replace(/\s+$/, '')
  }
  return null
}

/**
 * @param {ArrayBuffer|Uint8Array} input
 */
export function parseADF(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  const head = new TextDecoder('ascii').decode(bytes.subarray(0, 64))
  const m = HEADER_RE.exec(head)
  if (!m) {
    throw new ADFParseError(
      'Not an AlignDataFile binary ADF (expected "AlignDataFile ( bin )")',
      0,
    )
  }
  const version = m[1]
  const offset = m[0].length
  const parsed = parseObject(bytes, offset, bytes.length)
  if (parsed.pos !== bytes.length) {
    // Root object should consume the file; ignore trailing padding if any.
  }
  return {version, root: parsed.value}
}

function collectNamed(obj, name, out = []) {
  if (!obj || typeof obj !== 'object') {
    return out
  }
  if (obj.__type === 'object') {
    if (Object.prototype.hasOwnProperty.call(obj, name)) {
      for (const v of asList(obj[name])) {
        out.push(v)
      }
    }
    for (const key of obj.__keys || []) {
      if (key === name) {
        continue
      }
      collectNamed(obj[key], name, out)
    }
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      collectNamed(item, name, out)
    }
  }
  return out
}

function floatArrayPoints(value) {
  if (!value) {
    return []
  }
  if (value.points) {
    return value.points
  }
  return []
}

const KIND_BY_ARCH_POS = [
  null,
  'molar', 'molar', 'molar', 'premolar', 'premolar', 'canine', 'incisor', 'incisor',
  'incisor', 'incisor', 'canine', 'premolar', 'premolar', 'molar', 'molar', 'molar',
]

function toothKind(id) {
  const k = id >= 17 ? id - 16 : id
  return KIND_BY_ARCH_POS[k] || 'premolar'
}

function extractTooth(obj, jawName) {
  const id = i32(obj.id, 0)
  const name = str(obj.Name) || `Tooth_${String(id).padStart(2, '0')}`
  const anim = obj.animXfm && obj.animXfm.__type === 'object' ? obj.animXfm : obj
  const xf = transformOf(anim) || transformOf(obj.BasisStorage) || {
    translation: [0, 0, 0],
    rotation: [1, 0, 0, 0],
  }
  const crownCenter = vec3(anim.crownCenter)
  const rootCenter = vec3(anim.rootCenter)

  let facc = obj.FACCCurve
  if (facc && facc.FACCCurveData) {
    facc = facc.FACCCurveData
  }
  const faPoint = facc ? vec3(facc.FAPoint) : null
  const faNormal = facc ? vec3(facc.FAPointNormal) : null
  const faDir = facc ? vec3(facc.FALineDir) : null
  const mdw = facc ? f32(facc.MesialToDistalWidth, 0) : 0
  let blw = facc ? f32(facc.BuccalToLingualWidth, 0) : 0
  if (blw <= 0 || blw > 0.05) {
    blw = 0
  }
  const pickPoints = facc ? floatArrayPoints(facc.PickPointsArray) : []

  const designer = obj.QedgeToothDesigner
  const minHeight = designer ? f32(designer.MinToothHeight, 0) : 0

  let crownDim = vec3(obj.CrownDimensions?.Value) || vec3(obj.CrownDimensions)
  const features = []
  for (const key of obj.__keys || []) {
    for (const item of asList(obj[key])) {
      if (!item || item.__type !== 'object') {
        continue
      }
      const fname = str(item.Name) || ''
      if (fname === 'CrownDimensions' || fname === 'Feature:CrownDimensions') {
        crownDim = vec3(item.Value) || vec3(item) || crownDim
      }
      if (fname.startsWith('Feature:') && fname !== 'Feature:CrownDimensions') {
        const fromVal = floatArrayPoints(item.Value)
        const pts = fromVal.length ? fromVal : floatArrayPoints(item)
        const p = vec3(item.Value) || vec3(item)
        features.push({
          name: fname.slice('Feature:'.length),
          points: pts.length ? pts : p ? [p] : [],
        })
      }
    }
  }

  const ipPoints = []
  const vtxBlobs = collectNamed(obj, 'newvtxData')
  for (const blob of vtxBlobs) {
    const pts = floatArrayPoints(blob)
    if (pts.length) {
      ipPoints.push(pts)
    }
  }
  let maxVertexId = 0
  for (const blob of collectNamed(obj, 'newvtxIndices')) {
    const ids = blob?.ints || []
    for (const i of ids) {
      if (i > maxVertexId) {
        maxVertexId = i
      }
    }
  }

  const meshInfo = describeCompressedMesh(obj.CompressedQedge)

  const cej = obj.CEJPoints && obj.CEJPoints.__type === 'object' ? obj.CEJPoints : obj.CEJPoints
  const cejPoints = cej ? floatArrayPoints(cej.points) : []

  // CrownDimensions is [buccal-lingual, mesial-distal, occlusal height].
  const width = crownDim ? crownDim[1] : mdw || 0.008
  const depth = crownDim ? crownDim[0] : blw || width * 0.75
  const height = crownDim ? crownDim[2] : Math.min(minHeight || 0.012, 0.012)

  return {
    id,
    name,
    jaw: jawName,
    kind: toothKind(id),
    transform: xf,
    crownCenter,
    rootCenter,
    faPoint,
    faNormal,
    faDir,
    pickPoints,
    cejPoints,
    ipPoints,
    features,
    width,
    depth,
    height,
    mesialDistalWidth: mdw,
    buccalLingualWidth: blw,
    minToothHeight: minHeight,
    crownDimensions: crownDim,
    hasCompressedMesh: Boolean(meshInfo.bytes),
    compressedMesh: meshInfo,
    // Axis-aligned bounds of the crown mesh, read from its mts header (jaw space, metres).
    meshBounds: meshInfo.bbox,
    sampledVertexCount: ipPoints.reduce((n, p) => n + p.length, 0),
    hintedVertexCount: maxVertexId ? maxVertexId + 1 : 0,
  }
}

/** Read `n` bits (n <= 32) LSB-first starting at absolute bit `pos`. */
function readBits(bytes, pos, n) {
  let v = 0
  for (let i = 0; i < n; i++) {
    const p = pos + i
    v += ((bytes[p >> 3] >> (p & 7)) & 1) * 2 ** i
  }
  return v
}

const MTS_MAGIC = [0x22, 0x6d, 0x74, 0x73] // '"mts'

/**
 * Read the bounding box from a `CompressedData` blob without decoding it.
 *
 * The blob is a uint32 size, then a MetaStream ("mts") stream. Its mesh
 * payload is an LSB-first bitstream (see tools/mts/README.md); the first
 * attribute plug-in header ends with the bbox. Bit offsets below are from the
 * start of the blob. They were validated on all 54 blobs in PM.adf, but this is
 * a shortcut, not a general parser:
 *
 *   285  3 bits  v (3, 4 or 5): the preceding fields' width grows by 3 bits per v
 *   441-3*(5-v)  6 x float32  minX minY minZ maxX maxY maxZ (metres, jaw space)
 *
 * Returns null if the blob does not look like an mts stream.
 */
export function parseMtsHeader(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 80) {
    return null
  }
  for (let i = 0; i < 4; i++) {
    if (bytes[4 + i] !== MTS_MAGIC[i]) {
      return null
    }
  }
  const variant = readBits(bytes, 285, 3)
  if (variant < 3 || variant > 5) {
    return null
  }
  const bboxBit = 441 - 3 * (5 - variant)
  const dv = new DataView(new ArrayBuffer(4))
  const f = []
  for (let i = 0; i < 6; i++) {
    dv.setUint32(0, readBits(bytes, bboxBit + 32 * i, 32), true)
    f.push(dv.getFloat32(0, true))
  }
  const min = f.slice(0, 3)
  const max = f.slice(3, 6)
  for (let a = 0; a < 3; a++) {
    if (!Number.isFinite(min[a]) || !Number.isFinite(max[a]) || min[a] > max[a]) {
      return null
    }
    if (Math.abs(min[a]) > 10 || Math.abs(max[a]) > 10) {
      return null
    }
  }
  return {variant, bbox: {min, max}}
}

function describeCompressedMesh(qedge) {
  const info = {bytes: 0, codec: null, layers: 0, bbox: null}
  if (!qedge) {
    return info
  }
  const nodes = asList(qedge)
  for (const node of nodes) {
    const raw = node?.CompressedData
    let bytes = 0
    let buf = null
    if (raw && raw.bytes instanceof Uint8Array) {
      buf = raw.bytes
      bytes = raw.size || buf.length
    } else if (raw && raw.size) {
      bytes = raw.size
    }
    info.bytes += bytes
    info.layers += 1
    const header = buf ? parseMtsHeader(buf) : null
    if (header) {
      info.codec = 'mts'
      info.bbox = info.bbox || header.bbox
    }
  }
  if (!info.codec && info.bytes) {
    info.codec = 'qedge'
  }
  return info
}

function extractGingiva(jawObj) {
  const handlers = collectNamed(jawObj.CompoundSpline || {}, 'CVHandler')
  const labH = []
  const linH = []
  for (const h of handlers) {
    const n = str(h.Name) || ''
    const xf = transformOf(h.Transform)
    if (!xf) {
      continue
    }
    if (n.startsWith('Lab+')) {
      labH.push([n, xf.translation])
    } else if (n.startsWith('Lin+')) {
      linH.push([n, xf.translation])
    }
  }
  labH.sort((a, b) => a[0].localeCompare(b[0]))
  linH.sort((a, b) => a[0].localeCompare(b[0]))
  return {labial: labH.map((x) => x[1]), lingual: linH.map((x) => x[1])}
}

function extractJaw(obj, jawName) {
  const xf =
    transformOf(obj.Transform) ||
    transformOf(obj.basis) ||
    {translation: [0, 0, 0], rotation: [1, 0, 0, 0]}
  const teethRaw = asList(obj.Tooth).filter((t) => t && t.__type === 'object')
  const teeth = teethRaw.map((t) => extractTooth(t, jawName))
  teeth.sort((a, b) => a.id - b.id)
  return {
    name: str(obj.Name) || jawName,
    jaw: jawName,
    transform: xf,
    teeth,
    gingiva: extractGingiva(obj),
  }
}

/**
 * Pull a renderable dental scene out of a parsed ADF tree.
 */
export function extractDentalScene(parsed) {
  const root = parsed.root
  const jawPair = root.JawPair && root.JawPair.__type === 'object' ? root.JawPair : root
  const upper = jawPair.upper ? extractJaw(jawPair.upper, 'upper') : null
  const lower = jawPair.lower ? extractJaw(jawPair.lower, 'lower') : null
  return {
    version: parsed.version,
    upper,
    lower,
    teeth: [...(upper?.teeth || []), ...(lower?.teeth || [])],
  }
}
