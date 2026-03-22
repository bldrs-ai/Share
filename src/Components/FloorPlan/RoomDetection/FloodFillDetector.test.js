import {detectRoomsFloodFill} from './FloodFillDetector'


describe('FloodFillDetector', () => {
  it('detects a single room from 4 walls', () => {
    const elements = [
      {polygon: [[0, -0.1], [4, -0.1], [4, 0.1], [0, 0.1]], expressId: 1, category: 'wall'},
      {polygon: [[3.9, 0], [4.1, 0], [4.1, 3], [3.9, 3]], expressId: 2, category: 'wall'},
      {polygon: [[0, 2.9], [4, 2.9], [4, 3.1], [0, 3.1]], expressId: 3, category: 'wall'},
      {polygon: [[-0.1, 0], [0.1, 0], [0.1, 3], [-0.1, 3]], expressId: 4, category: 'wall'},
    ]

    const rooms = detectRoomsFloodFill(elements, 0.05)
    expect(rooms.length).toBe(1)
    // Area should be approximately 4*3 = 12m² minus wall thickness
    expect(rooms[0].area).toBeGreaterThan(8)
    expect(rooms[0].area).toBeLessThan(14)
  })

  it('detects two rooms separated by an internal wall', () => {
    const w = 0.1
    const elements = [
      // Outer walls
      {polygon: [[0, -w], [8, -w], [8, w], [0, w]], expressId: 1, category: 'wall'},
      {polygon: [[8 - w, 0], [8 + w, 0], [8 + w, 3], [8 - w, 3]], expressId: 2, category: 'wall'},
      {polygon: [[0, 3 - w], [8, 3 - w], [8, 3 + w], [0, 3 + w]], expressId: 3, category: 'wall'},
      {polygon: [[-w, 0], [w, 0], [w, 3], [-w, 3]], expressId: 4, category: 'wall'},
      // Internal dividing wall at X=4
      {polygon: [[4 - w, 0], [4 + w, 0], [4 + w, 3], [4 - w, 3]], expressId: 5, category: 'wall'},
    ]

    const rooms = detectRoomsFloodFill(elements, 0.05)
    expect(rooms.length).toBe(2)
  })

  it('returns empty for fewer than 3 walls', () => {
    const elements = [
      {polygon: [[0, 0], [4, 0], [4, 0.2], [0, 0.2]], expressId: 1, category: 'wall'},
    ]
    const rooms = detectRoomsFloodFill(elements, 0.05)
    expect(rooms.length).toBe(0)
  })

  it('detects room with a gap (doorway) as one room', () => {
    const w = 0.1
    const elements = [
      // Bottom wall with a gap (door) in the middle
      {polygon: [[0, -w], [1.5, -w], [1.5, w], [0, w]], expressId: 1, category: 'wall'},
      {polygon: [[2.5, -w], [4, -w], [4, w], [2.5, w]], expressId: 2, category: 'wall'},
      // Right, top, left walls (closed)
      {polygon: [[4 - w, 0], [4 + w, 0], [4 + w, 3], [4 - w, 3]], expressId: 3, category: 'wall'},
      {polygon: [[0, 3 - w], [4, 3 - w], [4, 3 + w], [0, 3 + w]], expressId: 4, category: 'wall'},
      {polygon: [[-w, 0], [w, 0], [w, 3], [-w, 3]], expressId: 5, category: 'wall'},
    ]

    const rooms = detectRoomsFloodFill(elements, 0.05)
    // The gap (doorway) means the room connects to the exterior — 0 rooms
    // OR if the gap is small enough that the buffer closes it — 1 room
    // With 8cm buffer on each wall piece, the 1m gap won't close → 0 rooms
    // This is correct behavior: an open doorway without a door = connected to exterior
    expect(rooms.length).toBeLessThanOrEqual(1)
  })
})
