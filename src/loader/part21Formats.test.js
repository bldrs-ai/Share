import {PART21_LOADER_TYPES, engineFormatOf} from './part21Formats'


describe('loader/part21Formats', () => {
  it('lists the part-21 loader types once, for every caller', () => {
    expect([...PART21_LOADER_TYPES].sort()).toEqual(['ifc', 'step', 'stp'])
  })

  it('maps each suffix to the Conway format it names; .ifczip as its entry would', () => {
    expect(engineFormatOf('ifc')).toBe('ifc')
    expect(engineFormatOf('ifczip')).toBe('ifc')
    expect(engineFormatOf('step')).toBe('step')
    expect(engineFormatOf('stp')).toBe('step')
    for (const other of ['glb', 'obj', 'constructor', '', undefined, null]) {
      expect(engineFormatOf(other)).toBeNull()
    }
  })
})
