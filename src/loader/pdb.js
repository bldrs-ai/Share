// pdb.js
import {
  IcosahedronGeometry,
  BoxGeometry,
  Group,
  Vector3,
  Color,
  MeshPhongMaterial,
  Mesh,
  BufferGeometry,
  Float32BufferAttribute,
} from 'three'


/**
 * @param {object} pdb
 * @param {object} viewer
 * @return {Group}
 */
export default function pdbToThree(pdb, viewer) {
  // Ensure bonds exist before we copy/translate geometry
  ensureBondsIfMissing(pdb)

  const geometryAtoms = pdb.geometryAtoms
  const geometryBonds = pdb.geometryBonds

  const sphereGeometry = new IcosahedronGeometry(1, 3)
  const boxGeometry = new BoxGeometry(1, 1, 1)
  const root = new Group()
  const offset = new Vector3()

  geometryAtoms.computeBoundingBox()
  geometryAtoms.boundingBox.getCenter(offset).negate()

  geometryAtoms.translate(offset.x, offset.y, offset.z)
  geometryBonds.translate(offset.x, offset.y, offset.z)

  let positions = geometryAtoms.getAttribute('position')
  const colors = geometryAtoms.getAttribute('color')

  const position = new Vector3()
  const color = new Color()

  const positionScalar = 1
  const atomScalar = 0.5
  const bondScalar = 0.1

  const atomMaterials = {}
  for (let i = 0; i < positions.count; i++) {
    position.x = positions.getX(i)
    position.y = positions.getY(i)
    position.z = positions.getZ(i)

    color.r = colors.getX(i)
    color.g = colors.getY(i)
    color.b = colors.getZ(i)

    const materialKey = `${color.r}${color.g}${color.b}`
    let atomMaterial = atomMaterials[materialKey]
    if (!atomMaterial) {
      atomMaterial = atomMaterials[materialKey] = new MeshPhongMaterial({color})
    }
    const atomMesh = new Mesh(sphereGeometry, atomMaterial)
    atomMesh.position.copy(position)
    atomMesh.position.multiplyScalar(positionScalar)
    atomMesh.scale.multiplyScalar(atomScalar)

    atomMesh.type = 'IFCOBJECT'
    atomMesh.expressID = i
    atomMesh.modelID = 0
    const json = pdb.json
    const name = lookupName(json, i)
    atomMesh.Name = {value: name}
    atomMesh.LongName = {value: name}

    root.add(atomMesh)
  }

  positions = geometryBonds.getAttribute('position')

  const start = new Vector3()
  const end = new Vector3()

  const colorWhite = 0xffffff
  const bondMaterial = new MeshPhongMaterial(colorWhite)
  for (let i = 0; i < (positions ? positions.count : 0); i += 2) {
    start.x = positions.getX(i)
    start.y = positions.getY(i)
    start.z = positions.getZ(i)

    end.x = positions.getX(i + 1)
    end.y = positions.getY(i + 1)
    end.z = positions.getZ(i + 1)

    start.multiplyScalar(positionScalar)
    end.multiplyScalar(positionScalar)

    const bondMesh = new Mesh(boxGeometry, bondMaterial)
    bondMesh.position.copy(start)

    const lerpFactor = 0.5
    bondMesh.position.lerp(end, lerpFactor)
    bondMesh.scale.set(bondScalar, bondScalar, start.distanceTo(end))
    bondMesh.lookAt(end)
    root.add(bondMesh)
  }

  viewer.getProperties = (modelId, expressId) => {
    return {
      id: expressId,
      element: lookupName(pdb.json, expressId),
    }
  }

  root.getPropertySets = () => []
  root.type = 'Molecule'
  root.Name = {value: 'Molecule'}
  root.LongName = {value: 'Molecule'}

  return root
}


/**
 * @param {object} json
 * @param {number} id
 * @return {string}
 */
function lookupName(json, id) {
  let name = 'unknown'
  if (json.atoms && id < json.atoms.length && json.atoms[id].length === 5) {
    const elementCode = json.atoms[id][4]
    switch (elementCode) {
      case 'H': name = 'Hydrogen'; break
      case 'C': name = 'Carbon'; break
      case 'N': name = 'Nitrogen'; break
      case 'O': name = 'Oxygen'; break
      case 'P': name = 'Phosphorus'; break
      case 'S': name = 'Sulfur'; break
      default: name = 'unknown'
    }
  }
  return name
}


/** Minimal covalent radii (Å) for bond inference */
const COVALENT_RADII = {
  H: 0.31, C: 0.76, N: 0.71, O: 0.66, F: 0.57, P: 1.07, S: 1.05, Cl: 1.02,
  Br: 1.20, I: 1.39, Na: 1.66, K: 2.03, Mg: 1.41, Ca: 1.76,
}
const DEFAULT_RADIUS = 0.77 // fallback if element not in table
const TOL = 1.15 // 15% slack over sum of covalent radii
const MIN_DIST = 0.4 // ignore ultra-short distances (<0.4 Å)


/** Infer bonds if PDBLoader didn't populate geometryBonds (no CONECT). */
function ensureBondsIfMissing(pdb) {
  const gAtoms = pdb.geometryAtoms
  const gBonds = pdb.geometryBonds

  const existing = gBonds.getAttribute('position')
  if (existing && existing.count > 0) {
    return // we already have sticks
  }

  const pos = gAtoms.getAttribute('position')
  if (!pos || pos.count === 0) {
    return
  }

  // Build atoms list with element symbols (if available)
  const json = pdb.json || {}
  const atoms = []
  for (let i = 0; i < pos.count; i++) {
    const e = (json.atoms && json.atoms[i] && json.atoms[i][4]) || 'C'
    atoms.push({
      x: pos.getX(i),
      y: pos.getY(i),
      z: pos.getZ(i),
      e,
    })
  }

  // Spatial grid (bucket) for near-neighbor search
  // Cell size ~ max bond length we care about (~3.5 Å for DNA/protein structures)
  const cellSize = 3
  const grid = new Map()
  /**
   * @param {number} ix
   * @param {number} iy
   * @param {number} iz
   * @return {string}
   */
  function key(ix, iy, iz) {
    return `${ix}|${iy}|${iz}`
  }

  /**
   * @param {number} v
   * @return {number}
   */
  function toIdx(v) {
    return Math.floor(v / cellSize)
  }

  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i]
    const k = key(toIdx(a.x), toIdx(a.y), toIdx(a.z))
    let bucket = grid.get(k)
    if (!bucket) {
      bucket = []; grid.set(k, bucket)
    }
    bucket.push(i)
  }

  const bondsPositions = []
  const min2 = MIN_DIST * MIN_DIST

  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i]
    const ix = toIdx(a.x)
    const iy = toIdx(a.y)
    const iz = toIdx(a.z)
    // search neighboring cells
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = grid.get(key(ix + dx, iy + dy, iz + dz))
          /** @type {Array<number>} */
          if (!bucket) {
            continue
          }
          for (const j of bucket) {
            if (j <= i) {
              continue // avoid duplicates/self
            }
            const b = atoms[j]
            const dxv = a.x - b.x
            const dyv = a.y - b.y
            const dzv = a.z - b.z
            const d2 = (dxv * dxv) + (dyv * dyv) + (dzv * dzv)
            if (d2 < min2) {
              continue
            }
            const ra = COVALENT_RADII[a.e] ?? DEFAULT_RADIUS
            const rb = COVALENT_RADII[b.e] ?? DEFAULT_RADIUS
            const max = TOL * (ra + rb)
            if (d2 <= max * max) {
              // Add as a line segment (two vertices) -> three.js boxes later
              bondsPositions.push(a.x, a.y, a.z, b.x, b.y, b.z)
            }
          }
        }
      }
    }
  }

  // Populate/replace geometryBonds
  const bondsGeom = new BufferGeometry()
  bondsGeom.setAttribute('position', new Float32BufferAttribute(new Float32Array(bondsPositions), 3))
  pdb.geometryBonds = bondsGeom
}
