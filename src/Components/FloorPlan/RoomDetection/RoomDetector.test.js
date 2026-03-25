import {detectRoomsFromElements} from './RoomDetector'


describe('RoomDetector', () => {
  it('detects a single room from 4 walls', () => {
    // Four walls forming a 4m x 3m room
    // Wall thickness = 0.2m, so bounding boxes are thin rectangles
    const elements = [
      // Bottom wall: runs along X from 0 to 4, at Z=0
      {polygon: [[0, -0.1], [4, -0.1], [4, 0.1], [0, 0.1]], expressId: 1, category: 'wall'},
      // Right wall: runs along Z from 0 to 3, at X=4
      {polygon: [[3.9, 0], [4.1, 0], [4.1, 3], [3.9, 3]], expressId: 2, category: 'wall'},
      // Top wall: runs along X from 0 to 4, at Z=3
      {polygon: [[0, 2.9], [4, 2.9], [4, 3.1], [0, 3.1]], expressId: 3, category: 'wall'},
      // Left wall: runs along Z from 0 to 3, at X=0
      {polygon: [[-0.1, 0], [0.1, 0], [0.1, 3], [-0.1, 3]], expressId: 4, category: 'wall'},
    ]

    const rooms = detectRoomsFromElements(elements)

    // Should detect at least one room
    expect(rooms.length).toBeGreaterThanOrEqual(1)

    // The room area should be approximately 4 * 3 = 12 m²
    // (measured to wall centerlines, so it's exact)
    const mainRoom = rooms[0]
    expect(mainRoom.area).toBeGreaterThan(5)
    expect(mainRoom.polygon.length).toBeGreaterThanOrEqual(3)
    expect(mainRoom.centroid).toBeDefined()
    expect(mainRoom.name).toBeDefined()
  })

  it('returns empty for fewer than 3 walls', () => {
    const elements = [
      {polygon: [[0, 0], [4, 0], [4, 0.2], [0, 0.2]], expressId: 1, category: 'wall'},
      {polygon: [[4, 0], [4.2, 0], [4.2, 3], [4, 3]], expressId: 2, category: 'wall'},
    ]

    const rooms = detectRoomsFromElements(elements)
    expect(rooms).toEqual([])
  })

  it('detects two rooms from an L-shaped layout', () => {
    // Two rooms separated by an internal wall
    const w = 0.1 // half wall thickness
    const elements = [
      // Outer walls
      {polygon: [[0, -w], [8, -w], [8, w], [0, w]], expressId: 1, category: 'wall'},
      {polygon: [[8 - w, 0], [8 + w, 0], [8 + w, 3], [8 - w, 3]], expressId: 2, category: 'wall'},
      {polygon: [[0, 3 - w], [8, 3 - w], [8, 3 + w], [0, 3 + w]], expressId: 3, category: 'wall'},
      {polygon: [[-w, 0], [w, 0], [w, 3], [-w, 3]], expressId: 4, category: 'wall'},
      // Internal dividing wall at X=4
      {polygon: [[4 - w, 0], [4 + w, 0], [4 + w, 3], [4 - w, 3]], expressId: 5, category: 'wall'},
    ]

    const rooms = detectRoomsFromElements(elements)
    // Should detect 2 rooms
    expect(rooms.length).toBeGreaterThanOrEqual(2)
  })
})
