// Tests for NavTreePanel's tree-flattening + display-ordering policy
// (#1595). The ordering discriminant: a raw scenegraph tree (plain
// GLB / OBJ — `treeData.isObject3D === true`) sorts siblings by label
// (UTF-16 ordinal, capitals first); IFC / STEP spatial trees (plain
// objects) render in their meaningful source order.

import {__getVisibleNodesForTest as getVisibleNodes, compareNodeLabels} from './NavTreePanel'


/**
 * Minimal spatial-tree node in the shape mapSpatialNode reads:
 * expressID + IFC-shaped Name (reifyName reads `Name.value`).
 *
 * @param {number} expressID
 * @param {string} name
 * @param {Array} [children]
 * @return {object}
 */
function node(expressID, name, children = []) {
  return {expressID, type: 'IFCOBJECT', Name: {value: name}, children}
}


describe('NavTreePanel/compareNodeLabels', () => {
  it('orders capitals before underscore before lowercase (UTF-16 ordinal)', () => {
    // The ISS_stationary.glb motivating case: real names rank above
    // exporter scaffolding and lowercase noise.
    const labels = ['panel_01_p', '_root', 'OCO3', 'hinge_02_p', 'ECOStress']
    const sorted = labels.map((label) => ({label})).sort(compareNodeLabels).map((n) => n.label)
    expect(sorted).toEqual(['ECOStress', 'OCO3', '_root', 'hinge_02_p', 'panel_01_p'])
  })

  it('treats missing labels as empty (sorted first, no throw)', () => {
    const sorted = [{label: 'A'}, {}, {label: null}].sort(compareNodeLabels)
    expect(sorted[sorted.length - 1].label).toBe('A')
  })
})


describe('NavTreePanel/getVisibleNodes — scenegraph ordering policy', () => {
  // reifyName's unnamed-node fallback resolves the type via
  // `model.getIfcType` — the identity closure convertToShareModel
  // attaches on every non-IFC model.
  const model = {getIfcType: (eltType) => eltType}

  it('sorts scenegraph-tree siblings by label, capitals first', () => {
    // isObject3D marks the tree as a raw Object3D hierarchy (plain
    // GLB / OBJ) whose sibling order is authoring noise.
    const root = {
      ...node(0, 'Scene', [
        node(1, '_root'),
        node(2, 'panel_01_p'),
        node(3, 'OCO3'),
        node(4, 'ECOStress'),
      ]),
      isObject3D: true,
    }
    const visible = getVisibleNodes(root, ['0'], true, model)
    expect(visible.map(({node: n}) => n.label)).toEqual(
      ['Scene', 'ECOStress', 'OCO3', '_root', 'panel_01_p'])
  })

  it('sorts at every depth of a scenegraph tree', () => {
    const root = {
      ...node(0, 'Scene', [
        node(1, '_root', [
          node(2, 'b-child'),
          node(3, 'A-child'),
        ]),
      ]),
      isObject3D: true,
    }
    const visible = getVisibleNodes(root, ['0', '1'], true, model)
    expect(visible.map(({node: n}) => n.label)).toEqual(
      ['Scene', '_root', 'A-child', 'b-child'])
  })

  it('keeps unnamed (placeholder-labelled) siblings in scenegraph order', () => {
    // Nodes without names share the 'Object' placeholder label; the
    // stable sort must not shuffle them relative to each other.
    const root = {
      ...node(0, 'Scene', [
        {expressID: 1, type: 'IFCOBJECT', children: []},
        {expressID: 2, type: 'IFCOBJECT', children: []},
        node(3, 'Named'),
      ]),
      isObject3D: true,
    }
    const visible = getVisibleNodes(root, ['0'], true, model)
    // 'IFCOBJECT' (reifyName type fallback) > 'Named' won't hold —
    // assert only the relative order of the two unnamed nodes.
    const unnamedIds = visible
      .filter(({node: n}) => n.expressID === 1 || n.expressID === 2)
      .map(({node: n}) => n.expressID)
    expect(unnamedIds).toEqual([1, 2])
  })

  it('leaves IFC/STEP spatial-tree order untouched (no isObject3D marker)', () => {
    // Storeys arrive in elevation order from the parser; alphabetizing
    // would scramble "Level 10" vs "Level 2". The policy must not
    // apply to plain spatial-structure objects.
    const root = node(0, 'Project', [
      node(1, 'Level 2'),
      node(2, 'Level 10'),
      node(3, 'Basement'),
    ])
    const visible = getVisibleNodes(root, ['0'], true, model)
    expect(visible.map(({node: n}) => n.label)).toEqual(
      ['Project', 'Level 2', 'Level 10', 'Basement'])
  })

  it('collapsed nodes hide their (sorted) children', () => {
    const root = {
      ...node(0, 'Scene', [node(1, 'B'), node(2, 'A')]),
      isObject3D: true,
    }
    const visible = getVisibleNodes(root, [], true, model)
    expect(visible.map(({node: n}) => n.label)).toEqual(['Scene'])
  })
})


describe('NavTreePanel/getVisibleNodes — transient anonymous-geometry rows (conway#387)', () => {
  const model = {getIfcType: (eltType) => eltType}
  const PART_NAUO = 14107
  const FACE_ID = 4462
  const SOLID_ID = 250

  /**
   * A STEP part node with an occurrence path, in the shape the spatial
   * tree hands to getVisibleNodes.
   *
   * @param {object} [extras] merged onto the node (droppedSolids, children…)
   * @return {object} tree root with one part under it
   */
  function stepTree(extras = {}) {
    return node(1, 'assembly', [{
      ...node(PART_NAUO, 'part'),
      occurrencePath: [PART_NAUO],
      ...extras,
    }])
  }

  it('injects transient rows under their part, as ephemeral solid rows', () => {
    const transient = {[PART_NAUO]: [{expressID: FACE_ID, label: 'Face #4462'}]}
    const visible = getVisibleNodes(stepTree(), ['1', `${PART_NAUO}`], true, model, transient)
    const row = visible.map(({node: n}) => n).find((n) => n.expressID === FACE_ID)
    expect(row).toBeDefined()
    expect(row.label).toBe('Face #4462')
    expect(row.ephemeral).toBe(true)
    expect(row.transient).toBe(true)
    // Path-scoped nodeId: reused parts must not alias expansion state, and
    // the row inherits the part's occurrence path for (path, id) selection.
    expect(row.nodeId).toBe('14107:4462')
    expect(row.occurrencePath).toEqual([PART_NAUO])
  })

  it('does not duplicate a piece the tree already carries as a solid node', () => {
    const solidChild = {
      ...node(SOLID_ID, 'Boss-Extrude7'),
      occurrencePath: [PART_NAUO],
      ephemeral: true,
    }
    const tree = stepTree({children: [solidChild]})
    const transient = {[PART_NAUO]: [{expressID: SOLID_ID, label: 'Solid #250'}]}
    const visible = getVisibleNodes(tree, ['1', `${PART_NAUO}`], true, model, transient)
    const rows = visible.map(({node: n}) => n).filter((n) => n.expressID === SOLID_ID)
    expect(rows.length).toBe(1)
    expect(rows[0].transient).toBe(void 0)
  })

  it('emits a "more" row for droppedSolids and retires it as rows materialize', () => {
    const twoDropped = getVisibleNodes(
      stepTree({droppedSolids: 2}), ['1', `${PART_NAUO}`], true, model, {})
    const moreRow = twoDropped.map(({node: n}) => n).find((n) => n.isMoreRow === true)
    expect(moreRow).toBeDefined()
    expect(moreRow.remaining).toBe(2)
    expect(moreRow.parentPath).toEqual([PART_NAUO])
    // The known-id set the click handler dedups against covers tree children
    // AND already-materialized transient rows.
    const transient = {[PART_NAUO]: [{expressID: FACE_ID, label: 'Item #4462'}]}
    const oneLeft = getVisibleNodes(
      stepTree({droppedSolids: 2}), ['1', `${PART_NAUO}`], true, model, transient)
    const remainingRow = oneLeft.map(({node: n}) => n).find((n) => n.isMoreRow === true)
    expect(remainingRow.remaining).toBe(1)
    expect(remainingRow.knownIds).toContain(FACE_ID)
    // Fully materialized → the row retires.
    const done = getVisibleNodes(
      stepTree({droppedSolids: 1}), ['1', `${PART_NAUO}`], true, model, transient)
    expect(done.map(({node: n}) => n).some((n) => n.isMoreRow === true)).toBe(false)
  })

  it('leaves IFC nodes (no occurrence path) untouched', () => {
    const ifcRoot = node(1, 'project', [node(2, 'storey')])
    const transient = {2: [{expressID: 99, label: 'Item #99'}]}
    const visible = getVisibleNodes(ifcRoot, ['1', '2'], true, model, transient)
    expect(visible.length).toBe(2)
    expect(visible.map(({node: n}) => n).some((n) => n.transient === true)).toBe(false)
  })
})
