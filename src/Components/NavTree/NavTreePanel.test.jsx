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
