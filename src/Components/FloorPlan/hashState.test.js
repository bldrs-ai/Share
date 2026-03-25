import {getFloorFromHash, HASH_PREFIX_FLOOR_PLAN} from './hashState'


describe('FloorPlan hashState', () => {
  it('getFloorFromHash returns null for empty hash', () => {
    expect(getFloorFromHash({hash: ''})).toBeNull()
  })

  it('getFloorFromHash returns null for unrelated hash', () => {
    expect(getFloorFromHash({hash: '#c:-26,12,30'})).toBeNull()
  })

  it('getFloorFromHash parses floor index', () => {
    expect(getFloorFromHash({hash: `#${HASH_PREFIX_FLOOR_PLAN}:0`})).toBe(0)
    expect(getFloorFromHash({hash: `#${HASH_PREFIX_FLOOR_PLAN}:2`})).toBe(2)
    expect(getFloorFromHash({hash: `#${HASH_PREFIX_FLOOR_PLAN}:15`})).toBe(15)
  })

  it('getFloorFromHash works with other hash params', () => {
    expect(getFloorFromHash({hash: `#c:-26,12,30;${HASH_PREFIX_FLOOR_PLAN}:3`})).toBe(3)
  })

  it('HASH_PREFIX_FLOOR_PLAN is fp', () => {
    expect(HASH_PREFIX_FLOOR_PLAN).toBe('fp')
  })
})
