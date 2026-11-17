import {Ray, Vector3} from 'three'
import {finiteHits} from './finiteHits'


const OFF_EDGE = 0.2


describe('viewer/three/finiteHits', () => {
  it('returns the same array when every hit is finite', () => {
    const hits = [{distance: 1}, {distance: 2}]
    expect(finiteHits(hits)).toBe(hits)
  })

  it('drops NaN and infinite hits and re-sorts the rest nearest first', () => {
    // The order intersectObjects can leave behind once a NaN poisons its
    // comparator sort.
    const hits = [{distance: 3}, {distance: NaN}, {distance: 1}, {distance: Infinity}, {distance: 2}]
    expect(finiteHits(hits).map((h) => h.distance)).toEqual([1, 2, 3])
  })

  it('drops the NaN hit three\'s triangle test reports for a NaN vertex', () => {
    // Pins the upstream behavior finiteHits exists for: r187's watertight
    // Ray.intersectTriangle returns a NaN point instead of null. If three
    // ever rejects this triangle itself, the first expect fails and
    // finiteHits can be reconsidered.
    const ray = new Ray(new Vector3(OFF_EDGE, OFF_EDGE, 1), new Vector3(0, 0, -1))
    const point = ray.intersectTriangle(
      new Vector3(NaN, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 1, 0), false, new Vector3())
    expect(point).not.toBeNull()
    const distance = ray.origin.distanceTo(point)
    expect(Number.isNaN(distance)).toBe(true)
    expect(finiteHits([{distance: 0.5}, {distance}])).toEqual([{distance: 0.5}])
  })
})
