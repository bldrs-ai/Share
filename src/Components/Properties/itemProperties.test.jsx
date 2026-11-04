import React from 'react'
import {render, screen} from '@testing-library/react'
import {MockModel} from '../../utils/IfcMock.test'
import {MAX_ARRAY_MEMBERS, createPropertyTable, hasProperties, quantities, renderableValue} from './itemProperties'


const REF_TYPE = 5


/**
 * `hasProperties` returns the `<tr>` wrapping the property table, so it needs
 * a table around it to be valid DOM.
 *
 * @param {object} row The element hasProperties resolved to
 */
function renderRow(row) {
  render(<table><tbody>{row}</tbody></table>)
}


/**
 * Regression cover for SHARE-1P3: one unresolvable reference inside a
 * property set threw a TypeError out of `dObj.Name.value` and took the whole
 * Properties panel down, rather than costing the one row it could not build.
 */
describe('hasProperties', () => {
  it('renders every property of a well-formed pset', async () => {
    const model = new MockModel({
      1: {Name: {value: 'Fire Rating'}, NominalValue: {value: 'F60'}},
      2: {Name: {value: 'Load Bearing'}, NominalValue: {value: 'True'}},
    })
    renderRow(await hasProperties(model, [
      {type: REF_TYPE, value: 1},
      {type: REF_TYPE, value: 2},
    ], 0))

    expect(screen.getByText('Fire Rating')).toBeInTheDocument()
    expect(screen.getByText('Load Bearing')).toBeInTheDocument()
  })

  it('skips a reference the model cannot resolve and keeps the rest', async () => {
    // Id 9 is absent from the model, so getItemProperties yields undefined.
    const model = new MockModel({
      1: {Name: {value: 'Fire Rating'}, NominalValue: {value: 'F60'}},
    })
    renderRow(await hasProperties(model, [
      {type: REF_TYPE, value: 9},
      {type: REF_TYPE, value: 1},
    ], 0))

    expect(screen.getByText('Fire Rating')).toBeInTheDocument()
    expect(screen.getByText('F60')).toBeInTheDocument()
  })

  it('skips a resolved property that carries no Name and keeps the rest', async () => {
    const model = new MockModel({
      1: {NominalValue: {value: 'orphan'}},
      2: {Name: {value: 'Fire Rating'}, NominalValue: {value: 'F60'}},
    })
    renderRow(await hasProperties(model, [
      {type: REF_TYPE, value: 1},
      {type: REF_TYPE, value: 2},
    ], 0))

    expect(screen.getByText('Fire Rating')).toBeInTheDocument()
    expect(screen.queryByText('orphan')).not.toBeInTheDocument()
  })

  it('still rejects a non-reference array, which is a different bug', async () => {
    const model = new MockModel({})
    await expect(hasProperties(model, [{type: 1, value: 'not a ref'}], 0))
      .rejects.toThrow('Array contains non-reference type')
  })
})


/**
 * `quantities` is unpackHelper's other consumer and dereferences `.Name.value`
 * exactly as `hasProperties` did, so it carries the same SHARE-1P3 crash
 * shape and needs the same guard.
 */
describe('quantities', () => {
  it('renders every quantity of a well-formed set', async () => {
    const model = new MockModel({
      1: {Name: {value: 'GrossArea'}, AreaValue: {value: '84.2'}},
      2: {Name: {value: 'Height'}, LengthValue: {value: '3.1'}},
    })
    renderRow(await quantities(model, [
      {type: REF_TYPE, value: 1},
      {type: REF_TYPE, value: 2},
    ], 0))

    expect(screen.getByText('GrossArea')).toBeInTheDocument()
    expect(screen.getByText('84.2')).toBeInTheDocument()
    expect(screen.getByText('Height')).toBeInTheDocument()
  })

  it('skips a quantity that carries no Name and keeps the rest', async () => {
    const model = new MockModel({
      1: {AreaValue: {value: 'orphan'}},
      2: {Name: {value: 'GrossArea'}, AreaValue: {value: '84.2'}},
    })
    renderRow(await quantities(model, [
      {type: REF_TYPE, value: 1},
      {type: REF_TYPE, value: 2},
    ], 0))

    expect(screen.getByText('GrossArea')).toBeInTheDocument()
    expect(screen.queryByText('orphan')).not.toBeInTheDocument()
  })

  it('skips a reference the model cannot resolve and keeps the rest', async () => {
    const model = new MockModel({
      1: {Name: {value: 'GrossArea'}, AreaValue: {value: '84.2'}},
    })
    renderRow(await quantities(model, [
      {type: REF_TYPE, value: 9},
      {type: REF_TYPE, value: 1},
    ], 0))

    expect(screen.getByText('GrossArea')).toBeInTheDocument()
  })
})


const IFCGRID = 3009204131
const IFCGRIDAXIS = 852622518
const IFCPOLYLINE = 3724593414
const IFCCARTESIANPOINT = 1123145078
const STRING = 1
const ENUM = 3
const REAL = 4


/**
 * A model whose engine resolves references the way both of Share's engines do:
 * `deref` calls `ifcAPI.properties.getItemProperties(0, id, true)`, and each
 * call hands back a FRESH copy, as the worker facade (a structured clone) and
 * the main-thread compat surface both do.
 *
 * @param {object} byId lines by expressID
 * @return {object}
 */
function engineModel(byId) {
  const read = (id) => (byId[id] === undefined ? undefined : structuredClone(byId[id]))
  return {
    getItemProperties: (id) => Promise.resolve(read(id)),
    ifcManager: {ifcAPI: {properties: {getItemProperties: (modelID, id) => Promise.resolve(read(id))}}},
  }
}


/**
 * An IfcGrid as the engine returns it: its axes are REFERENCES to IfcGridAxis
 * entities, which carry no GlobalId, so `deref` resolves each one into a whole
 * entity object (and on through its curve to the curve's points).
 *
 * @return {object} `{model, grid}`
 */
function gridModel() {
  const lines = {
    9011: {
      expressID: 9011, type: IFCGRIDAXIS, AxisTag: {type: STRING, value: 'A'},
      AxisCurve: {type: 5, value: 9013}, SameSense: {type: ENUM, value: 'T'},
    },
    9012: {
      expressID: 9012, type: IFCGRIDAXIS, AxisTag: {type: STRING, value: '1'},
      AxisCurve: {type: 5, value: 9013}, SameSense: {type: ENUM, value: 'T'},
    },
    9013: {expressID: 9013, type: IFCPOLYLINE, Points: [{type: 5, value: 9014}]},
    9014: {
      expressID: 9014, type: IFCCARTESIANPOINT,
      Coordinates: [{type: REAL, value: 0}, {type: REAL, value: 0}],
    },
  }
  const grid = {
    expressID: 9010, type: IFCGRID,
    GlobalId: {type: STRING, value: '3vB2YO$MX4xv5uCqZZG05x'},
    Name: {type: STRING, value: 'Grid'},
    UAxes: [{type: 5, value: 9011}],
    VAxes: [{type: 5, value: 9012}],
  }
  return {model: engineModel(lines), grid}
}


/**
 * Share#2063: selecting an IfcGrid took the whole app down. Its UAxes / VAxes
 * deref'd to arrays of entity OBJECTS, which the table handed to React as
 * children (React #31), and the root ErrorBoundary replaced the page.
 */
describe('createPropertyTable with references deref resolves to entities', () => {
  it('renders an array of references to entities without a GlobalId', async () => {
    const {model, grid} = gridModel()
    render(await createPropertyTable(model, grid))
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getAllByText('Gridaxis')).toHaveLength(2)
  })

  it('stops nesting tables past the depth limit and shows the reference instead', async () => {
    const {model, grid} = gridModel()
    render(await createPropertyTable(model, grid))
    // grid → axis (depth 1) → polyline (depth 2) → its point is past the limit.
    expect(screen.getAllByText('#9014 Cartesianpoint')).toHaveLength(2)
    expect(screen.queryByText('Coordinates')).not.toBeInTheDocument()
  })

  it('leaves the record it was given unchanged (deref rewrites in place)', async () => {
    const {model, grid} = gridModel()
    const before = structuredClone(grid)
    await createPropertyTable(model, grid)
    expect(grid).toEqual(before)
  })
})


describe('renderableValue', () => {
  const model = engineModel({})

  it('never hands React a raw object', async () => {
    expect(await renderableValue(model, true, 0)).toBe('true')
    expect(await renderableValue(model, null, 0)).toBe('')
    // A reference to a rooted entity keeps its type, as its nested table did.
    expect(await renderableValue(model, {type: 'IFCWALL', ref: 'guid-1'}, 0)).toBe('Wall guid-1')
    expect(await renderableValue(model, {ref: 'guid-2'}, 0)).toBe('guid-2')
    expect(await renderableValue(model, {a: 1}, 0)).toBe('{"a":1}')
    render(<div>{await renderableValue(model, ['x', 2, {b: 3}], 0)}</div>)
    expect(screen.getByText('x')).toBeInTheDocument()
    expect(screen.getByText(', {"b":3}')).toBeInTheDocument()
  })
})


describe('renderableValue on long and primitive arrays', () => {
  const model = engineModel({})

  it('renders an all-primitive array as ONE string, not a node per member', async () => {
    expect(await renderableValue(model, [0, 2, 'x', true], 0)).toBe('0, 2, x, true')
  })

  it('shows the first MAX_ARRAY_MEMBERS members of a long array, then how many more', async () => {
    const extra = 30
    const total = MAX_ARRAY_MEMBERS + extra
    const numbers = Array.from({length: total}, (_, i) => i)
    const text = await renderableValue(model, numbers, 0)
    expect(text.endsWith(`${MAX_ARRAY_MEMBERS - 1}, … and ${extra} more`)).toBe(true)
    expect(text).not.toContain(`, ${MAX_ARRAY_MEMBERS},`)

    const objects = Array.from({length: total}, (_, i) => ({n: i}))
    const parts = await renderableValue(model, objects, 0)
    expect(parts).toHaveLength(MAX_ARRAY_MEMBERS + 1)
    render(<div>{parts}</div>)
    expect(screen.getByText(`, … and ${extra} more`)).toBeInTheDocument()
  })
})
