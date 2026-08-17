/* eslint-disable no-magic-numbers */
import {
  INSTANCE_TABLES_VERSION,
  buildInstanceTablesExtensionData,
  parseInstanceTablesExtensionData,
} from './bldrsInstanceTables'


/** @return {Array<object>} two-node fixture, one STEP-ish and one bare */
function twoNodes() {
  return [
    {
      count: 2,
      color: {x: 0.8, y: 0.8, z: 0.8, w: 1},
      parents: [11, 12],
      occurrenceIds: [0, 1],
      geometryIds: [500, 500],
      occurrencePaths: [[3, 7], [3, 8]],
    },
    {
      count: 1,
      color: {x: 0.8, y: 0.8, z: 0.8, w: 0.5},
      parents: [20],
      occurrenceIds: [2],
      geometryIds: [600],
      occurrencePaths: [[4]],
    },
  ]
}


describe('loader/bldrsInstanceTables', () => {
  it('round-trips build -> parse as identity', () => {
    const nodes = twoNodes()
    const parsed = parseInstanceTablesExtensionData(buildInstanceTablesExtensionData(nodes))
    expect(parsed).toEqual(nodes)
  })

  it('keeps source colors verbatim — the palette-determinism contract', () => {
    // 0.8 is Conway's fallback grey; if this drifted (e.g. through an
    // sRGB<->linear conversion, which moves 0.8 to ~0.6), isDefaultColor
    // would stop recognising the model as colorless on reload.
    const parsed = parseInstanceTablesExtensionData(
      buildInstanceTablesExtensionData(twoNodes()))
    expect(parsed[0].color).toEqual({x: 0.8, y: 0.8, z: 0.8, w: 1})
  })

  it('omits geometry ids / occurrence paths when no node carries them (IFC)', () => {
    const ifcNode = [{
      count: 2,
      color: {x: 0.5, y: 0.2, z: 0.2, w: 1},
      parents: [7, 9],
      occurrenceIds: [0, 1],
      geometryIds: null,
      occurrencePaths: null,
    }]
    const data = buildInstanceTablesExtensionData(ifcNode)
    expect(data.geometryIds).toBeUndefined()
    expect(data.occurrencePaths).toBeUndefined()
    expect(parseInstanceTablesExtensionData(data)).toEqual(ifcNode)
  })

  it('rejects a wrong version rather than half-reading', () => {
    const data = buildInstanceTablesExtensionData(twoNodes())
    expect(parseInstanceTablesExtensionData({...data, version: INSTANCE_TABLES_VERSION + 1}))
      .toBeNull()
  })

  it('rejects tables whose lengths disagree with the node counts', () => {
    const data = buildInstanceTablesExtensionData(twoNodes())
    const tampered = {...data, nodes: [...data.nodes, {count: 5, color: [0, 0, 0, 1]}]}
    expect(parseInstanceTablesExtensionData(tampered)).toBeNull()
  })

  it('rejects malformed payloads instead of throwing', () => {
    expect(parseInstanceTablesExtensionData(null)).toBeNull()
    expect(parseInstanceTablesExtensionData({})).toBeNull()
    expect(parseInstanceTablesExtensionData(
      {version: INSTANCE_TABLES_VERSION, nodes: [{count: 1, color: [1, 1, 1, 1]}],
        parents: '!!!', occurrenceIds: '!!!'})).toBeNull()
  })
})
