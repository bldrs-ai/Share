import {
  Box3,
  Box3Helper,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  FileLoader,
  Group,
  Line,
  LineBasicMaterial,
  Loader,
  Mesh,
  Matrix4,
  MeshPhysicalMaterial,
  Points,
  PointsMaterial,
  Quaternion,
  Vector3,
} from 'three'

import {extractDentalScene, parseADF} from './adf-parser.js'
import {MESH_KIND_CROWN, parseMeshSidecar} from './mesh-sidecar.js'

/** ADF stores metres; the scene is built in millimetres. */
export const ADF_MM = 1000

const ENAMEL = {
  incisor: 0xfbf6ea,
  canine: 0xf7f0dc,
  premolar: 0xf3ead4,
  molar: 0xefe4c8,
}

function applyAdfTransform(obj3d, xf) {
  if (!xf) {
    return
  }
  const [w, x, y, z] = xf.rotation
  obj3d.quaternion.set(x, y, z, w)
  obj3d.position.set(
    xf.translation[0] * ADF_MM,
    xf.translation[1] * ADF_MM,
    xf.translation[2] * ADF_MM,
  )
}

function v3(p) {
  return new Vector3(p[0], p[1], p[2])
}

function toothPose(tooth) {
  const origin = v3(tooth.transform.translation)
  const crown = tooth.crownCenter ? v3(tooth.crownCenter) : origin.clone()
  const z = tooth.faDir ? v3(tooth.faDir).normalize() : new Vector3(0, 0, 1)
  const towardCrown = crown.clone().sub(origin)
  if (towardCrown.lengthSq() > 1e-12 && towardCrown.dot(z) < 0) {
    z.negate()
  }
  let y = tooth.faNormal ? v3(tooth.faNormal).normalize() : new Vector3(0, 1, 0)
  if (Math.abs(y.dot(z)) > 0.95) {
    y = new Vector3(0, 1, 0)
  }
  const x = new Vector3().crossVectors(y, z).normalize()
  if (x.lengthSq() < 1e-8) {
    x.crossVectors(new Vector3(1, 0, 0), z).normalize()
  }
  y.crossVectors(z, x).normalize()
  const q = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z))
  return {position: origin.multiplyScalar(ADF_MM), quaternion: q}
}

function mm(p) {
  return [p[0] * ADF_MM, p[1] * ADF_MM, p[2] * ADF_MM]
}

function roundedRect(w, d, t) {
  // t in 0..1 around a rounded rectangle in the XY plane.
  const hw = w * 0.5
  const hd = d * 0.5
  const r = Math.min(hw, hd) * 0.35
  const straightW = Math.max(0, w - 2 * r)
  const straightD = Math.max(0, d - 2 * r)
  const perim = 2 * straightW + 2 * straightD + 2 * Math.PI * r
  let s = ((t % 1) + 1) % 1
  s *= perim
  const q = Math.PI / 2
  if (s < straightW) {
    return [-hw + r + s, hd]
  }
  s -= straightW
  if (s < r * q) {
    const a = s / r
    return [hw - r + Math.sin(a) * r, hd - r + Math.cos(a) * r]
  }
  s -= r * q
  if (s < straightD) {
    return [hw, hd - r - s]
  }
  s -= straightD
  if (s < r * q) {
    const a = s / r
    return [hw - r + Math.cos(a) * r, -hd + r - Math.sin(a) * r]
  }
  s -= r * q
  if (s < straightW) {
    return [hw - r - s, -hd]
  }
  s -= straightW
  if (s < r * q) {
    const a = s / r
    return [-hw + r - Math.sin(a) * r, -hd + r - Math.cos(a) * r]
  }
  s -= r * q
  if (s < straightD) {
    return [-hw, -hd + r + s]
  }
  s -= straightD
  const a = Math.min(s / r, q)
  return [-hw + r - Math.cos(a) * r, hd - r + Math.sin(a) * r]
}

function cuspDelta(kind, t, v) {
  // v is 0 at CEJ, 1 at occlusal. Displace occlusal vertices into cusps.
  if (v < 0.82) {
    return [0, 0, 0]
  }
  const k = (v - 0.82) / 0.18
  const [x, y] = roundedRect(1, 1, t)
  if (kind === 'incisor') {
    return [0, 0, k * 0.15 * (1 - Math.abs(x))]
  }
  if (kind === 'canine') {
    const r = Math.hypot(x, y)
    return [0, 0, k * 0.55 * (1 - r)]
  }
  if (kind === 'premolar') {
    const a = Math.cos(Math.PI * y) * Math.cos(Math.PI * x * 0.4)
    return [0, 0, k * 0.28 * Math.max(0, a)]
  }
  const cx = Math.sign(x) || 1
  const cy = Math.sign(y) || 1
  const dx = x - 0.35 * cx
  const dy = y - 0.32 * cy
  const bump = Math.exp(-(dx * dx + dy * dy) * 14)
  return [0, 0, k * 0.22 * bump]
}

/**
 * Patient-sized crown proxy. Axes: X mesial-distal, Y buccal-lingual, Z occlusal.
 * Sized in millimetres.
 */
export function createToothGeometry(kind, width, depth, height) {
  const segs = 28
  const stacks = 12
  const positions = []
  const indices = []

  const cervical = 0.78
  for (let j = 0; j <= stacks; j++) {
    const v = j / stacks
    // 0 = root stub, ~0.22 = CEJ, 1 = occlusal
    let scale
    let z
    if (v < 0.22) {
      const u = v / 0.22
      scale = 0.35 + 0.65 * u * u
      z = u * height * 0.22
    } else {
      const u = (v - 0.22) / 0.78
      scale = cervical + (1 - cervical) * Math.sin(u * Math.PI * 0.5)
      if (kind === 'incisor' || kind === 'canine') {
        scale *= 1 - 0.08 * u
      }
      z = height * (0.22 + u * 0.78)
    }
    const w = width * scale
    const d = depth * scale * (kind === 'incisor' ? 0.55 : kind === 'canine' ? 0.7 : 1)
    for (let i = 0; i < segs; i++) {
      const t = i / segs
      const [x0, y0] = roundedRect(w, d, t)
      const [dx, dy, dz] = cuspDelta(kind, t, v)
      positions.push(x0 + dx * width * 0.15, y0 + dy * depth * 0.15, z + dz * height)
    }
  }

  for (let j = 0; j < stacks; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * segs + i
      const b = j * segs + ((i + 1) % segs)
      const c = (j + 1) * segs + i
      const d = (j + 1) * segs + ((i + 1) % segs)
      indices.push(a, c, b, b, c, d)
    }
  }

  // Occlusal cap
  const topStart = stacks * segs
  const cap = positions.length / 3
  let cx = 0
  let cy = 0
  let cz = 0
  for (let i = 0; i < segs; i++) {
    cx += positions[(topStart + i) * 3]
    cy += positions[(topStart + i) * 3 + 1]
    cz += positions[(topStart + i) * 3 + 2]
  }
  cx /= segs
  cy /= segs
  cz /= segs
  if (kind === 'molar' || kind === 'premolar') {
    cz -= height * 0.04
  }
  positions.push(cx, cy, cz)
  for (let i = 0; i < segs; i++) {
    const a = topStart + i
    const b = topStart + ((i + 1) % segs)
    indices.push(cap, a, b)
  }

  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

function lineGeometry(points) {
  const geo = new BufferGeometry()
  const arr = new Float32Array(points.length * 3)
  for (let i = 0; i < points.length; i++) {
    const p = mm(points[i])
    arr[i * 3] = p[0]
    arr[i * 3 + 1] = p[1]
    arr[i * 3 + 2] = p[2]
  }
  geo.setAttribute('position', new BufferAttribute(arr, 3))
  return geo
}

function loftGeometry(a, b) {
  const n = Math.min(a.length, b.length)
  if (n < 2) {
    return null
  }
  const positions = []
  const indices = []
  for (let i = 0; i < n; i++) {
    const p = mm(a[i])
    const q = mm(b[i])
    positions.push(p[0], p[1], p[2], q[0], q[1], q[2])
  }
  for (let i = 0; i < n - 1; i++) {
    const a0 = i * 2
    const b0 = i * 2 + 1
    const a1 = (i + 1) * 2
    const b1 = (i + 1) * 2 + 1
    indices.push(a0, b0, a1, a1, b0, b1)
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

function pointsGeometry(points) {
  const geo = new BufferGeometry()
  const arr = new Float32Array(points.length * 3)
  for (let i = 0; i < points.length; i++) {
    const p = mm(points[i])
    arr[i * 3] = p[0]
    arr[i * 3 + 1] = p[1]
    arr[i * 3 + 2] = p[2]
  }
  geo.setAttribute('position', new BufferAttribute(arr, 3))
  return geo
}

/** Real crown surface from a decoded mesh sidecar entry, in jaw space (mm). */
function crownGeometry(entry) {
  const src = entry.positions
  const positions = new Float32Array(src.length)
  for (let i = 0; i < src.length; i++) {
    positions[i] = src[i] * ADF_MM
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(positions, 3))
  geo.setIndex(new BufferAttribute(entry.indices, 1))
  geo.computeVertexNormals()
  return geo
}

function enamelMaterial(kind) {
  return new MeshPhysicalMaterial({
    color: new Color(ENAMEL[kind] || ENAMEL.premolar),
    roughness: 0.28,
    metalness: 0.0,
    clearcoat: 0.45,
    clearcoatRoughness: 0.25,
    reflectivity: 0.4,
  })
}

function featureColor(name) {
  const n = name.toLowerCase()
  if (n.includes('facc') || n.includes('ridge')) {
    return 0x5ad0ff
  }
  if (n.includes('buccal')) {
    return 0xff8a4a
  }
  if (n.includes('lingual')) {
    return 0x7dffb3
  }
  if (n.includes('groove')) {
    return 0xd97bff
  }
  if (n.includes('tip')) {
    return 0xffe066
  }
  return 0xcfd8e3
}

function gingivaMaterial() {
  return new MeshPhysicalMaterial({
    color: new Color(0xd9898c),
    roughness: 0.55,
    metalness: 0.0,
    side: DoubleSide,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  })
}

function buildJaw(jaw, options) {
  const group = new Group()
  group.name = jaw.name
  applyAdfTransform(group, jaw.transform)

  const teethGroup = new Group()
  teethGroup.name = 'teeth'
  const faccGroup = new Group()
  faccGroup.name = 'facc'
  const scanGroup = new Group()
  scanGroup.name = 'scanPoints'
  const boundsGroup = new Group()
  boundsGroup.name = 'meshBounds'

  const records = []
  for (const tooth of jaw.teeth) {
    const g = new Group()
    g.name = tooth.name
    g.userData = {
      toothId: tooth.id,
      kind: tooth.kind,
      jaw: tooth.jaw,
      compressedMesh: tooth.compressedMesh,
      hintedVertexCount: tooth.hintedVertexCount,
      sampledVertexCount: tooth.sampledVertexCount,
      meshBounds: tooth.meshBounds,
    }

    const real = options.crowns?.get(tooth.id)
    let mesh
    if (real) {
      // Decoded CompressedQedge surface; already in jaw space.
      mesh = new Mesh(crownGeometry(real), enamelMaterial(tooth.kind))
      g.userData.realMesh = true
      g.userData.vertexCount = real.positions.length / 3
    } else {
      const w = tooth.width * ADF_MM
      const d = tooth.depth * ADF_MM
      const h = tooth.height * ADF_MM
      mesh = new Mesh(createToothGeometry(tooth.kind, w, d, h), enamelMaterial(tooth.kind))
      const pose = toothPose(tooth)
      mesh.position.copy(pose.position)
      mesh.quaternion.copy(pose.quaternion)
    }
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.name = `${tooth.name}_crown`
    g.add(mesh)
    teethGroup.add(g)

    if (tooth.pickPoints.length > 1) {
      const line = new Line(
        lineGeometry(tooth.pickPoints),
        new LineBasicMaterial({color: 0x3aa0ff}),
      )
      line.name = `${tooth.name}_facc`
      faccGroup.add(line)
    }
    for (const feat of tooth.features || []) {
      if (feat.points.length > 1) {
        const line = new Line(
          lineGeometry(feat.points),
          new LineBasicMaterial({color: featureColor(feat.name)}),
        )
        line.name = `${tooth.name}_${feat.name}`
        faccGroup.add(line)
      } else if (feat.points.length === 1) {
        const pts = new Points(
          pointsGeometry(feat.points),
          new PointsMaterial({color: featureColor(feat.name), size: 0.35}),
        )
        pts.name = `${tooth.name}_${feat.name}`
        scanGroup.add(pts)
      }
    }

    const cloud = []
    for (const set of tooth.ipPoints) {
      cloud.push(...set)
    }
    if (tooth.cejPoints.length) {
      cloud.push(...tooth.cejPoints)
    }
    if (cloud.length) {
      const pts = new Points(
        pointsGeometry(cloud),
        new PointsMaterial({color: 0xffcc66, size: 0.18, sizeAttenuation: true}),
      )
      pts.name = `${tooth.name}_scan`
      scanGroup.add(pts)
    }

    if (tooth.meshBounds) {
      // Decoded from the CompressedQedge header: the real crown mesh's extent.
      const box = new Box3(v3(mm(tooth.meshBounds.min)), v3(mm(tooth.meshBounds.max)))
      const helper = new Box3Helper(box, 0x8fd18f)
      helper.name = `${tooth.name}_bounds`
      boundsGroup.add(helper)
    }

    records.push({...tooth, group: g, mesh})
  }

  group.add(teethGroup)
  group.add(faccGroup)
  group.add(scanGroup)
  group.add(boundsGroup)

  const gingivaGroup = new Group()
  gingivaGroup.name = 'gingiva'
  const gingiva = loftGeometry(jaw.gingiva.labial, jaw.gingiva.lingual)
  if (gingiva) {
    const gingivaMesh = new Mesh(gingiva, gingivaMaterial())
    gingivaMesh.name = 'gingivaSurface'
    gingivaMesh.receiveShadow = true
    gingivaGroup.add(gingivaMesh)
  }
  if (jaw.gingiva.labial.length > 1) {
    gingivaGroup.add(new Line(lineGeometry(jaw.gingiva.labial), new LineBasicMaterial({color: 0xc45c63})))
  }
  if (jaw.gingiva.lingual.length > 1) {
    gingivaGroup.add(new Line(lineGeometry(jaw.gingiva.lingual), new LineBasicMaterial({color: 0xa3454c})))
  }
  group.add(gingivaGroup)

  group.userData.teeth = records
  group.userData.facc = faccGroup
  group.userData.scanPoints = scanGroup
  group.userData.meshBounds = boundsGroup
  group.userData.gingiva = gingivaGroup
  return group
}

/**
 * Three.js loader for Align Technology `.adf` files.
 *
 * ```js
 * const loader = new ADFLoader();
 * const result = await loader.loadAsync('PM.adf');
 * scene.add(result.group);
 * ```
 *
 * The full-resolution tooth surfaces are MetaStream ("mts") progressive-mesh
 * streams. The browser can't decode them yet; tools/mts/build_meshes.py
 * decodes them offline into a `*.meshes.bin` sidecar. Pass it as
 * `parse(buffer, { meshes })` to render the real crowns; otherwise each tooth
 * is a crown proxy sized from CrownDimensions / FACC widths and posed from the
 * FACC frame. Each crown's true bounding box (from the stream header) is drawn
 * as `meshBounds` either way.
 */
export class ADFLoader extends Loader {
  load(url, onLoad, onProgress, onError) {
    const loader = new FileLoader(this.manager)
    loader.setResponseType('arraybuffer')
    loader.setPath(this.path)
    loader.setRequestHeader(this.requestHeader)
    loader.setWithCredentials(this.withCredentials)
    loader.load(
      url,
      (buffer) => {
        try {
          onLoad(this.parse(buffer))
        } catch (err) {
          if (onError) {
            onError(err)
          } else {
            console.error(err)
          }
          this.manager.itemError(url)
        }
      },
      onProgress,
      onError,
    )
  }

  /**
   * @param {ArrayBuffer} buffer the .adf file
   * @param {{meshes?: ArrayBuffer|Array}} options `meshes`: a *.meshes.bin
   *   sidecar (or its parsed entries) with decoded crown surfaces
   */
  parse(buffer, options = {}) {
    const parsed = parseADF(buffer)
    let meshes = options.meshes
    if (meshes && !Array.isArray(meshes)) {
      meshes = parseMeshSidecar(meshes)
    }
    if (meshes) {
      options = {...options, crowns: new Map()}
      for (const m of meshes) {
        if (m.kind === MESH_KIND_CROWN) {
          options.crowns.set(m.toothId, m)
        }
      }
    }
    const scene = extractDentalScene(parsed)
    const group = new Group()
    group.name = 'ADF'

    const jaws = {}
    if (scene.upper) {
      jaws.upper = buildJaw(scene.upper, options)
      group.add(jaws.upper)
    }
    if (scene.lower) {
      jaws.lower = buildJaw(scene.lower, options)
      group.add(jaws.lower)
    }

    // ADF Y is roughly anterior, Z occlusal. Tilt so the arch faces the camera.
    group.rotation.x = -Math.PI / 2

    return {
      group,
      jaws,
      teeth: scene.teeth,
      scene,
      parsed,
    }
  }
}

export {parseADF, extractDentalScene, parseMeshSidecar}
