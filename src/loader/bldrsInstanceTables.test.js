/* eslint-disable no-magic-numbers */
import {BufferAttribute, BufferGeometry} from 'three'
import {
  INSTANCE_TABLES_VERSION,
  INSTANCE_TABLES_VERSION_UNCOLLAPSED,
  buildInstanceTablesExtensionData,
  makeRangeCanary,
  parseInstanceTablesExtensionData,
  rangeCanaryOf,
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

  it('writes v1 when not collapsing, so a pre-v2 reader still reads it', () => {
    // The flag-off writer's contract: nothing it emits changes version, so a
    // rollback to an older build never meets a payload it would refuse.
    expect(buildInstanceTablesExtensionData(twoNodes()).version)
      .toBe(INSTANCE_TABLES_VERSION_UNCOLLAPSED)
    expect(buildInstanceTablesExtensionData(twoNodes(), {collapsed: true}).version)
      .toBe(INSTANCE_TABLES_VERSION)
  })

  describe('collapsed (v2) nodes', () => {
    /** @return {Array<object>} `twoNodes` with the first one collapsed */
    function hybrid() {
      const nodes = twoNodes()
      nodes[0].ranges = [{vertexCount: 3, indexCount: 3}, {vertexCount: 4, indexCount: 6}]
      nodes[0].canary = 0xdeadbeef
      return nodes
    }

    it('round-trips ranges as explicit, back-to-back starts', () => {
      const parsed = parseInstanceTablesExtensionData(
        buildInstanceTablesExtensionData(hybrid(), {collapsed: true}))

      expect(parsed[0].ranges).toEqual([
        {vertexStart: 0, vertexCount: 3, indexStart: 0, indexCount: 3},
        {vertexStart: 3, vertexCount: 4, indexStart: 3, indexCount: 6},
      ])
      expect(parsed[0].canary).toBe(0xdeadbeef)
      // The other node stays an ordinary instanced one: a v2 file is hybrid.
      expect(parsed[1].ranges).toBeUndefined()
      expect(parsed[1]).toEqual(twoNodes()[1])
    })

    it('refuses to write ranges into a v1 payload', () => {
      expect(() => buildInstanceTablesExtensionData(hybrid())).toThrow()
    })

    it('rejects ranges on a v1 payload', () => {
      const data = buildInstanceTablesExtensionData(hybrid(), {collapsed: true})
      expect(parseInstanceTablesExtensionData(
        {...data, version: INSTANCE_TABLES_VERSION_UNCOLLAPSED})).toBeNull()
    })

    it('rejects a collapsed node with no canary, or with the wrong row count', () => {
      const data = buildInstanceTablesExtensionData(hybrid(), {collapsed: true})
      const noCanary = structuredClone(data)
      delete noCanary.nodes[0].canary
      expect(parseInstanceTablesExtensionData(noCanary)).toBeNull()

      const shortRanges = buildInstanceTablesExtensionData(
        hybrid().map((node, i) => (i === 0 ? {...node, ranges: node.ranges.slice(1)} : node)),
        {collapsed: true})
      expect(parseInstanceTablesExtensionData(shortRanges)).toBeNull()
    })

    it('rejects an empty row — an element that could never be drawn or picked', () => {
      const nodes = hybrid()
      nodes[0].ranges[1].indexCount = 0
      expect(parseInstanceTablesExtensionData(
        buildInstanceTablesExtensionData(nodes, {collapsed: true}))).toBeNull()
    })
  })

  describe('the range canary', () => {
    /**
     * @param {Array<number>} positions flat xyz
     * @param {Array<number>} indices merged, absolute
     * @return {BufferGeometry}
     */
    function geometryOf(positions, indices) {
      const geometry = new BufferGeometry()
      geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
      geometry.setIndex(new BufferAttribute(new Uint32Array(indices), 1))
      return geometry
    }

    const TWO_TRIANGLES = [0, 0, 0, 1, 0, 0, 0, 1, 0, 5, 0, 0, 6, 0, 0, 5, 1, 0]
    const RANGES = [
      {vertexStart: 0, vertexCount: 3, indexStart: 0, indexCount: 3},
      {vertexStart: 3, vertexCount: 3, indexStart: 3, indexCount: 3},
    ]
    const PARENTS = [11, 12]
    const OCCURRENCES = [0, 1]

    /**
     * @param {Array<object>} [ranges]
     * @param {Array<number>} [parents]
     * @return {object} a collapsed table over the two triangles
     */
    function tableOf(ranges = RANGES, parents = PARENTS) {
      return {ranges, parents, occurrenceIds: OCCURRENCES, geometryIds: null, occurrencePaths: null}
    }

    it('agrees between the writer\'s per-row stream and the reader\'s merged walk', () => {
      // The two halves are computed from different data on purpose — the
      // writer from each element's own arrays, the reader through the ranges
      // — so this equality is the thing the canary witnesses.
      const writer = makeRangeCanary()
      for (const row of [0, 1]) {
        const local = TWO_TRIANGLES.slice(row * 9, (row + 1) * 9)
        writer.row({parent: PARENTS[row], occurrenceId: OCCURRENCES[row]},
          3, (v, c) => local[(v * 3) + c], 3, (i) => i)
      }
      expect(rangeCanaryOf(geometryOf(TWO_TRIANGLES, [0, 1, 2, 3, 4, 5]), tableOf()))
        .toBe(writer.digest())
    })

    it('moves when rows swap, when a boundary moves, and when a position changes by one ulp', () => {
      const base = rangeCanaryOf(geometryOf(TWO_TRIANGLES, [0, 1, 2, 3, 4, 5]), tableOf())
      const swapped = [...TWO_TRIANGLES.slice(9), ...TWO_TRIANGLES.slice(0, 9)]
      expect(rangeCanaryOf(geometryOf(swapped, [0, 1, 2, 3, 4, 5]), tableOf())).not.toBe(base)

      const shifted = [
        {vertexStart: 0, vertexCount: 4, indexStart: 0, indexCount: 3},
        {vertexStart: 4, vertexCount: 2, indexStart: 3, indexCount: 3},
      ]
      expect(rangeCanaryOf(geometryOf(TWO_TRIANGLES, [0, 1, 2, 3, 4, 5]), tableOf(shifted)))
        .not.toBe(base)

      const nudged = [...TWO_TRIANGLES]
      nudged[16] = Math.fround(1 + (2 ** -23))
      expect(rangeCanaryOf(geometryOf(nudged, [0, 1, 2, 3, 4, 5]), tableOf())).not.toBe(base)
    })

    it('moves when the IDENTITY rows are reordered against untouched geometry', () => {
      // Codex on #1872: geometry and ranges intact, `parents` swapped — every
      // pick would name the other element. The identity words are what see it.
      const geometry = geometryOf(TWO_TRIANGLES, [0, 1, 2, 3, 4, 5])
      expect(rangeCanaryOf(geometry, tableOf(RANGES, [12, 11])))
        .not.toBe(rangeCanaryOf(geometry, tableOf()))
    })

    it('ignores a triangle\'s corner ROTATION but not its reflection', () => {
      // Meshopt's index codec may rotate corners (lossless: same triangle,
      // same winding); the canary must not refuse that. A reflection flips
      // the winding, which is a different triangle facing, and still counts.
      const base = rangeCanaryOf(geometryOf(TWO_TRIANGLES, [0, 1, 2, 3, 4, 5]), tableOf())
      expect(rangeCanaryOf(geometryOf(TWO_TRIANGLES, [1, 2, 0, 5, 3, 4]), tableOf())).toBe(base)
      expect(rangeCanaryOf(geometryOf(TWO_TRIANGLES, [0, 2, 1, 3, 4, 5]), tableOf())).not.toBe(base)
    })

    it('returns null for a range outside the geometry, rather than a hash', () => {
      expect(rangeCanaryOf(geometryOf(TWO_TRIANGLES, [0, 1, 2, 3, 4, 5]),
        tableOf([{vertexStart: 3, vertexCount: 9, indexStart: 0, indexCount: 3}]))).toBeNull()
    })
  })
})
