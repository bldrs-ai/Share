import * as THREE from 'three'


/**
 * @param {object} pdb
 * @return {THREE.Object3D}
 */
export default function pdbToThree(pdb, viewer) {
  const geometryAtoms = pdb.geometryAtoms
  const geometryBonds = pdb.geometryBonds
  const sphereGeometry = new THREE.IcosahedronGeometry(1, 3)
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1)
  const root = new THREE.Group()
  const offset = new THREE.Vector3()

  geometryAtoms.computeBoundingBox()
  geometryAtoms.boundingBox.getCenter(offset).negate()

  geometryAtoms.translate(offset.x, offset.y, offset.z)
  geometryBonds.translate(offset.x, offset.y, offset.z)

  let positions = geometryAtoms.getAttribute('position')
  const colors = geometryAtoms.getAttribute('color')

  const position = new THREE.Vector3()
  const color = new THREE.Color()

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
      atomMaterial = atomMaterials[materialKey] = new THREE.MeshPhongMaterial({color: color})
    }
    const atomMesh = new THREE.Mesh(sphereGeometry, atomMaterial)
    atomMesh.position.copy(position)
    atomMesh.position.multiplyScalar(positionScalar)
    atomMesh.scale.multiplyScalar(atomScalar)

    atomMesh.type = 'IFCOBJECT'
    atomMesh.expressID = i
    const json = pdb.json
    const name = lookupName(json, i)
    // Verify format of json entry for this atom before trying to get name
    atomMesh.Name = {value: name}
    atomMesh.LongName = {value: name}

    root.add(atomMesh)
  }

  positions = geometryBonds.getAttribute('position')

  const start = new THREE.Vector3()
  const end = new THREE.Vector3()

  const colorWhite = 0xffffff
  const bondMaterial = new THREE.MeshPhongMaterial(colorWhite)
  for (let i = 0; i < positions.count; i += 2) {
    start.x = positions.getX(i)
    start.y = positions.getY(i)
    start.z = positions.getZ(i)

    end.x = positions.getX(i + 1)
    end.y = positions.getY(i + 1)
    end.z = positions.getZ(i + 1)

    start.multiplyScalar(positionScalar)
    end.multiplyScalar(positionScalar)

    const bondMesh = new THREE.Mesh(boxGeometry, bondMaterial)
    bondMesh.position.copy(start)
    // TODO(pablo): not sure what this does
    // eslint-disable-next-line no-magic-numbers
    bondMesh.position.lerp(end, 0.5)
    bondMesh.scale.set(bondScalar, bondScalar, start.distanceTo(end))
    // bondMesh.scale.multiplyScalar(scaleScalar)
    bondMesh.lookAt(end)
    root.add(bondMesh)
  }

  viewer.getProperties = (modelId, expressId) => {
    return {
      id: expressId,
      element: lookupName(pdb.json, expressId),
    }
  }

  root.getPropertySets = () => {
    return []
  }

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
    default: name = 'unknown'
    }
  }
  return name
}
