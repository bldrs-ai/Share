/**
 * 3D Room Overlay — renders detected rooms as colored transparent
 * floor planes in the Three.js scene.
 *
 * Each room is a flat mesh at the storey elevation with:
 * - Semi-transparent colored fill
 * - Room name as a text sprite
 * - Area label
 * - Click to select
 */

import {
  Shape,
  ShapeGeometry,
  MeshBasicMaterial,
  Mesh,
  Group,
  CanvasTexture,
  SpriteMaterial,
  Sprite,
  DoubleSide,
} from 'three'


const ROOM_COLORS = [
  0x4fc3f7, 0x81c784, 0xffb74d, 0xce93d8,
  0xf06292, 0x4dd0e1, 0xaed581, 0xff8a65,
  0xba68c8, 0x4db6ac, 0xdce775, 0xe57373,
  0x64b5f6, 0xa1887f, 0x90a4ae, 0xfff176,
]

const ROOM_OPACITY = 0.3
const LABEL_SCALE = 0.8


/**
 * Create a 3D room overlay group from detected rooms.
 *
 * @param {Array<DetectedRoom>} rooms - from room detection
 * @param {number} elevation - Y position (storey elevation in meters)
 * @return {Group} Three.js group containing all room meshes and labels
 */
export function createRoomOverlay(rooms, elevation) {
  const group = new Group()
  group.name = 'RoomOverlay'

  for (let i = 0; i < rooms.length; i++) {
    const room = rooms[i]
    const color = ROOM_COLORS[i % ROOM_COLORS.length]

    // Create floor plane mesh from room polygon
    const floorMesh = createRoomFloorMesh(room.polygon, elevation, color)
    if (floorMesh) {
      floorMesh.userData = {roomId: room.id, roomName: room.name, roomArea: room.area}
      group.add(floorMesh)
    }

    // Create label sprite
    const label = createRoomLabel(room, elevation, color)
    if (label) {
      group.add(label)
    }
  }

  return group
}


/**
 * Create a flat colored mesh from a 2D room polygon.
 * The polygon is in XZ coordinates, rendered at Y=elevation.
 */
function createRoomFloorMesh(polygon, elevation, color) {
  if (!polygon || polygon.length < 3) return null

  try {
    // Create Three.js Shape from polygon (XZ → XY for Shape, then rotate)
    const shape = new Shape()
    shape.moveTo(polygon[0][0], polygon[0][1])
    for (let i = 1; i < polygon.length; i++) {
      shape.lineTo(polygon[i][0], polygon[i][1])
    }
    shape.closePath()

    const geometry = new ShapeGeometry(shape)

    // Rotate from XY plane to XZ plane (floor)
    // ShapeGeometry creates in XY, we need XZ
    const positions = geometry.attributes.position
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i)
      const y = positions.getY(i)
      positions.setXYZ(i, x, elevation + 0.35, y) // above floor slab + finish
    }
    positions.needsUpdate = true
    geometry.computeVertexNormals()

    const material = new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: ROOM_OPACITY,
      side: DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })

    return new Mesh(geometry, material)
  } catch (e) {
    console.warn('RoomOverlay3D: Failed to create mesh for polygon', e)
    return null
  }
}


/**
 * Create a text sprite label for a room.
 */
function createRoomLabel(room, elevation, color) {
  if (!room.centroid) return null

  try {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 128
    const ctx = canvas.getContext('2d')

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.roundRect(4, 4, 248, 120, 8)
    ctx.fill()

    // Room name
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 28px Helvetica, Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(room.name, 128, 45)

    // Area
    const areaText = room.area >= 1
      ? `${room.area.toFixed(1)} m²`
      : `${(room.area * 10000).toFixed(0)} cm²`
    ctx.font = '22px Helvetica, Arial, sans-serif'
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`
    ctx.fillText(areaText, 128, 80)

    // Long name if available
    if (room.longName) {
      ctx.font = '18px Helvetica, Arial, sans-serif'
      ctx.fillStyle = '#999999'
      ctx.fillText(room.longName, 128, 108)
    }

    const texture = new CanvasTexture(canvas)
    const material = new SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    })

    const sprite = new Sprite(material)
    sprite.position.set(room.centroid[0], elevation + 1.2, room.centroid[1])
    sprite.scale.set(LABEL_SCALE, LABEL_SCALE * 0.5, 1)

    return sprite
  } catch (e) {
    console.warn('RoomOverlay3D: Failed to create label', e)
    return null
  }
}


/**
 * Remove the room overlay from the scene.
 *
 * @param {Scene} scene
 */
export function removeRoomOverlay(scene) {
  const overlay = scene.getObjectByName('RoomOverlay')
  if (overlay) {
    // Dispose geometries and materials
    overlay.traverse((child) => {
      if (child.geometry) child.geometry.dispose()
      if (child.material) {
        if (child.material.map) child.material.map.dispose()
        child.material.dispose()
      }
    })
    scene.remove(overlay)
  }
}
