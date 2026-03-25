import {
  findSnapPoint,
  createDistanceMeasurement,
  createAreaMeasurement,
} from './MeasurementTool'


describe('MeasurementTool', () => {
  const elements = [
    {
      polygon: [[0, 0], [5, 0], [5, 3], [0, 3]],
      category: 'wall',
    },
  ]

  describe('findSnapPoint', () => {
    it('snaps to nearby vertex', () => {
      const snap = findSnapPoint(0.1, 0.1, elements)
      expect(snap.snapped).toBe(true)
      expect(snap.x).toBe(0)
      expect(snap.z).toBe(0)
    })

    it('snaps to midpoint', () => {
      const snap = findSnapPoint(2.6, 0.1, elements)
      expect(snap.snapped).toBe(true)
      expect(snap.x).toBe(2.5) // midpoint of (0,0)-(5,0)
      expect(snap.z).toBe(0)
    })

    it('does not snap when far away', () => {
      const snap = findSnapPoint(10, 10, elements)
      expect(snap.snapped).toBe(false)
      expect(snap.x).toBe(10)
      expect(snap.z).toBe(10)
    })
  })

  describe('createDistanceMeasurement', () => {
    it('computes correct distance', () => {
      const m = createDistanceMeasurement([0, 0], [3, 4])
      expect(m.distance).toBe(5)
      expect(m.type).toBe('distance')
    })
  })

  describe('createAreaMeasurement', () => {
    it('computes correct area for a rectangle', () => {
      const a = createAreaMeasurement([[0, 0], [4, 0], [4, 3], [0, 3]])
      expect(a.area).toBe(12)
      expect(a.type).toBe('area')
    })

    it('computes correct area for a triangle', () => {
      const a = createAreaMeasurement([[0, 0], [6, 0], [0, 4]])
      expect(a.area).toBe(12)
    })
  })
})
