/* eslint-disable no-magic-numbers */
import {Group, Mesh} from 'three'
import {
  SELECTION_MAX_CHARS,
  readSelectionHash,
  resolveSelectionRefs,
  selectionRefs,
  writeSelectionHash,
} from './selectionHash'


/**
 * @param {string} [initial]
 * @return {object} a location double with a normalized `hash`
 */
function loc(initial = '') {
  let value = initial
  return {
    get hash() {
      return value
    },
    set hash(next) {
      value = next && !next.startsWith('#') ? `#${next}` : next
    },
  }
}


/**
 * @param {object|null} sceneGraphModel a model for name paths, or null for IFC / STEP
 * @return {object} a viewer whose isolator has a model
 */
function viewerFor(sceneGraphModel = null) {
  return {isolator: {
    ifcModel: sceneGraphModel ?? {},
    _isSceneGraphModel: () => sceneGraphModel !== null,
  }}
}


describe('Containers/selectionHash', () => {
  it('writes a multi-selection\'s rows by id, and nothing for one row', () => {
    const location = loc('#c:1,2,3;n:')
    writeSelectionHash(location, viewerFor(), ['621', '396'])
    expect(location.hash).toBe('#c:1,2,3;n:;sel:e621,e396')
    expect(readSelectionHash(location)).toEqual(['e621', 'e396'])
    expect(resolveSelectionRefs(readSelectionHash(location), viewerFor())).toEqual([621, 396])
    // Down to one row: the path carries it, the token goes.
    writeSelectionHash(location, viewerFor(), ['621'])
    expect(location.hash).toBe('#c:1,2,3;n:')
    expect(readSelectionHash(location)).toBeNull()
  })

  it('keeps a single row the path doesn\'t name', () => {
    // A shift-click dropped the path's element from a multi-selection; the
    // survivor has to stay in the link, or the path restores the dropped one.
    const location = loc('#sel:e621,e396')
    writeSelectionHash(location, viewerFor(), ['396'], false)
    expect(readSelectionHash(location)).toEqual(['e396'])
    writeSelectionHash(location, viewerFor(), ['396'], true)
    expect(readSelectionHash(location)).toBeNull()
  })

  it('writes scene-graph rows by NavTree name path', () => {
    const root = new Group()
    root.expressID = 0
    const tag = (obj, id, name) => Object.assign(obj, {expressID: id, name, Name: {value: name}})
    const jaw = tag(new Group(), 1, 'Upper Jaw')
    jaw.add(tag(new Mesh(), 2, 'Tooth_07'), tag(new Mesh(), 3, 'Tooth_08'))
    root.add(jaw)
    const viewer = viewerFor(root)
    expect(selectionRefs([2, 3], viewer)).toEqual(['nUpper%20Jaw/Tooth_07', 'nUpper%20Jaw/Tooth_08'])
    const location = loc()
    writeSelectionHash(location, viewer, [2, 3])
    expect(resolveSelectionRefs(readSelectionHash(location), viewer)).toEqual([2, 3])
  })

  it('does nothing before the model loads, and leaves out a list too long for a link', () => {
    const location = loc('#sel:e1,e2')
    writeSelectionHash(location, {isolator: {}}, [])
    expect(location.hash).toBe('#sel:e1,e2')
    const many = Array.from({length: SELECTION_MAX_CHARS}, (_, i) => 1000 + i)
    writeSelectionHash(location, viewerFor(), many)
    expect(readSelectionHash(location)).toBeNull()
  })

  it('drops refs it can\'t resolve', () => {
    expect(resolveSelectionRefs(['e5', 'bogus', 'nA', 'o1.2'], viewerFor())).toEqual([5])
  })
})
