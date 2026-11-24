/* eslint-disable no-magic-numbers */
import {editRefError, formatEditRef, isPortableEditRef, parseEditRef} from './editRefs'


describe('viewer/edit/editRefs', () => {
  it.each([
    'g3hm2qpxcLC2QR6PjoCX$Ma',
    'g0000000000000000000000',
    'o12',
    'o12.34.567',
    'nUpper%20Jaw/teeth/Tooth_07',
    'nMesh~2',
    'n~1',
    'n',
  ])('round-trips %s', (ref) => {
    const parsed = parseEditRef(ref)
    expect(parsed).not.toBeNull()
    expect(formatEditRef(parsed)).toBe(ref)
  })

  it('parses each kind into its fields', () => {
    expect(parseEditRef('g3hm2qpxcLC2QR6PjoCX$Ma')).toEqual({kind: 'g', globalId: '3hm2qpxcLC2QR6PjoCX$Ma'})
    expect(parseEditRef('o12.34')).toEqual({kind: 'o', ids: [12, 34]})
    expect(parseEditRef('nA/B~2')).toEqual({kind: 'n', segments: [{name: 'A', ordinal: 1}, {name: 'B', ordinal: 2}]})
  })

  it('formats a name path canonically', () => {
    expect(formatEditRef(parseEditRef('nMesh~1'))).toBe('nMesh')
  })

  it.each([
    ['e123', /g<GlobalId>/],
    ['g3hm2qpxcLC2QR6PjoCX$M', /not an edit ref/],
    ['g3hm2qpxcLC2QR6PjoCX$Maa', /not an edit ref/],
    ['g3hm2qpxcLC2QR6PjoCX+Ma', /not an edit ref/],
    ['o1..2', /not an edit ref/],
    ['o', /not an edit ref/],
    ['n%ZZ', /not an edit ref/],
    ['x1', /not an edit ref/],
    ['', /not an edit ref/],
    [null, /not an edit ref/],
    [42, /not an edit ref/],
  ])('rejects %p', (ref, reason) => {
    expect(parseEditRef(ref)).toBeNull()
    expect(editRefError(ref)).toMatch(reason)
  })

  it.each(['0', '1', '2', '3'])('accepts a GlobalId leading with %s (the top 2 bits)', (lead) => {
    expect(parseEditRef(`g${lead}${'0'.repeat(21)}`)).toEqual({kind: 'g', globalId: `${lead}${'0'.repeat(21)}`})
  })

  it.each(['4', 'Z', '$'])('rejects a GlobalId leading with %s, which encodes more than 128 bits', (lead) => {
    const ref = `g${lead}${'0'.repeat(21)}`
    expect(parseEditRef(ref)).toBeNull()
    expect(editRefError(ref)).toMatch(/not an edit ref/)
  })

  it('reports no error for a valid ref', () => {
    expect(editRefError('o1.2')).toBeNull()
  })

  it('refuses to format what is not an edit ref', () => {
    expect(() => formatEditRef({kind: 'e', id: 1})).toThrow(TypeError)
  })

  it('marks STEP occurrence refs as source-pinned, not portable', () => {
    expect(isPortableEditRef('g3hm2qpxcLC2QR6PjoCX$Ma')).toBe(true)
    expect(isPortableEditRef('nA/B')).toBe(true)
    expect(isPortableEditRef('o12.34')).toBe(false)
  })
})
