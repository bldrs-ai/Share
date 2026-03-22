import {extractCenterlines} from './WallCenterlines'


describe('WallCenterlines', () => {
  it('extracts centerline from a horizontal wall rectangle', () => {
    const elements = [{
      polygon: [[0, 0], [5, 0], [5, 0.2], [0, 0.2]],
      expressId: 1,
      category: 'wall',
    }]

    const cls = extractCenterlines(elements)
    expect(cls).toHaveLength(1)

    const cl = cls[0]
    // Centerline should run along the long axis (X)
    expect(cl.p1[1]).toBeCloseTo(0.1, 1) // Z should be at midpoint
    expect(cl.p2[1]).toBeCloseTo(0.1, 1)
    expect(cl.expressId).toBe(1)
    expect(cl.thickness).toBeCloseTo(0.2, 1)
  })

  it('skips non-wall elements', () => {
    const elements = [
      {polygon: [[0, 0], [5, 0], [5, 0.2], [0, 0.2]], expressId: 1, category: 'wall'},
      {polygon: [[0, 0], [1, 0], [1, 1], [0, 1]], expressId: 2, category: 'column'},
    ]

    const cls = extractCenterlines(elements)
    expect(cls).toHaveLength(1)
    expect(cls[0].expressId).toBe(1)
  })

  it('returns empty for no walls', () => {
    expect(extractCenterlines([])).toEqual([])
  })
})
