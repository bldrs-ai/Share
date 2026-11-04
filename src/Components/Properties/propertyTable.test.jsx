/* eslint-disable no-magic-numbers, require-await */
import React from 'react'
import {render, screen} from '@testing-library/react'
import {deref} from '@bldrs-ai/ifclib'
import {EngineSession} from '../../engine/EngineSession'
import {createEngineHandler} from '../../engine/engineHandler'
import {Op} from '../../engine/protocol'
import {makeInProcessTransport} from '../../engine/transports'
import {MAX_ARRAY_MEMBERS, createPropertyTable, createPropertyTables} from './itemProperties'
import {resolvePropertyTables, resolveValue, schemaTypeName} from './propertyTable'


// Share#2070: the Properties panel's tables are resolved by ONE module
// (propertyTable.js), next to the engine when the model has an engine
// session, on the page otherwise. These tests pin the three things that
// claim rests on: the table is the same wherever it was resolved; under a
// session it is one request, not one per reference; and the resolver's
// deref is ifclib's deref, apart from the changes it names. Plus Share#2066:
// a GLB cache hit resolves references against its own records.


const IFCGRID = 3009204131
const IFCGRIDAXIS = 852622518
const IFCPOLYLINE = 3724593414
const IFCCARTESIANPOINT = 1123145078
const IFCWALL = 2391406946
const IFCPROPERTYSET = 1451395588
const IFCPROPERTYSINGLEVALUE = 3650150729
const STRING = 1
const ENUM = 3
const REAL = 4
const REF = 5
const ref = (value) => ({type: REF, value})


/**
 * Lines for a grid with three axes, a wall it names by GlobalId, a long list
 * of point references, and a property set. Shaped as conway's compat surface
 * returns them: numeric `type`, step values as `{type, value}`.
 *
 * @return {object} lines by expressID
 */
function gridLines() {
  const lines = {
    9011: {
      expressID: 9011, type: IFCGRIDAXIS, AxisTag: {type: STRING, value: 'A'},
      AxisCurve: ref(9013), SameSense: {type: ENUM, value: 'T'},
    },
    9012: {
      expressID: 9012, type: IFCGRIDAXIS, AxisTag: {type: STRING, value: '\\X2\\00E9\\X0\\'},
      AxisCurve: ref(9013), SameSense: {type: ENUM, value: 'F'},
    },
    9015: {
      expressID: 9015, type: IFCGRIDAXIS, AxisTag: {type: STRING, value: 'C'},
      AxisCurve: ref(9013), SameSense: {type: ENUM, value: 'T'},
    },
    9013: {expressID: 9013, type: IFCPOLYLINE, Points: [ref(9014), ref(9016)]},
    9014: {
      expressID: 9014, type: IFCCARTESIANPOINT,
      Coordinates: [{type: REAL, value: 0}, {type: REAL, value: 0}],
    },
    9016: {
      expressID: 9016, type: IFCCARTESIANPOINT,
      Coordinates: [{type: REAL, value: 10}, {type: REAL, value: 0}],
    },
    9020: {
      expressID: 9020, type: IFCWALL,
      GlobalId: {type: STRING, value: '0wall0000000000000000A'}, Name: {type: STRING, value: 'W'},
    },
    9030: {
      expressID: 9030, type: IFCPROPERTYSET, Name: {type: STRING, value: 'Pset_Grid'},
      HasProperties: [ref(9031), ref(9032)],
    },
    9031: {
      expressID: 9031, type: IFCPROPERTYSINGLEVALUE, Name: {type: STRING, value: 'Spacing'},
      NominalValue: {type: REAL, value: 6},
    },
    9032: {
      expressID: 9032, type: IFCPROPERTYSINGLEVALUE, Name: {type: STRING, value: 'Origin'},
      NominalValue: {type: STRING, value: 'SW'},
    },
  }
  const extraPoints = MAX_ARRAY_MEMBERS + 20
  for (let i = 0; i < extraPoints; i++) {
    lines[10000 + i] = {
      expressID: 10000 + i, type: IFCCARTESIANPOINT, Coordinates: [{type: REAL, value: i}],
    }
  }
  lines[9010] = {
    expressID: 9010, type: IFCGRID,
    GlobalId: {type: STRING, value: '3vB2YO$MX4xv5uCqZZG05x'},
    Name: {type: STRING, value: 'Grid'},
    UAxes: [ref(9011), ref(9015)],
    VAxes: [ref(9012)],
    WAxes: null,
    Neighbour: ref(9020),
    Samples: Array.from({length: extraPoints}, (_, i) => ref(10000 + i)),
    Labels: Array.from({length: extraPoints}, (_, i) => ({type: STRING, value: `L${i}`})),
  }
  return lines
}


/**
 * conway's `getLine(id, flatten)`: a recursive read inlines every reference
 * in a field, or in an array whose first member is one, as a whole entity
 * (ifc_api_proxy_ifc.js#flattenLine). Fresh objects on every read, as both
 * engines return.
 *
 * @param {object} lines
 * @return {function(number, number, boolean): Promise<object>}
 */
function engineReads(lines) {
  const readLine = (id, flatten) => {
    if (lines[id] === undefined) {
      return undefined
    }
    const line = structuredClone(lines[id])
    if (flatten) {
      for (const key of Object.keys(line)) {
        const value = line[key]
        if (value && value.type === REF) {
          line[key] = readLine(value.value, true)
        } else if (Array.isArray(value) && value.length > 0 && value[0]?.type === REF) {
          line[key] = value.map((member) => readLine(member.value, true))
        }
      }
    }
    return line
  }
  return {readLine, getItemProperties: async (_modelID, id, recursive = false) => readLine(id, recursive)}
}


/**
 * The main-thread engine's model: conway's `properties.*` and the model
 * methods conwayDirectIfcLoader.js#attachConwayDirectModelMethods puts over
 * them.
 *
 * @param {object} lines
 * @return {object} model
 */
function mainThreadModel(lines) {
  const {getItemProperties} = engineReads(lines)
  const ifcAPI = {properties: {getItemProperties, getIfcType: (code) => schemaTypeName(code)}}
  return {
    getItemProperties: (id, recursive = false) => ifcAPI.properties.getItemProperties(0, id, recursive),
    ifcManager: {ifcAPI},
  }
}


/**
 * The same model with its engine in a session (in process: the same handler
 * the worker runs, over the same structured clone), presented as the engine
 * worker's facade presents it (engineModelLoad.js#makeEngineIfcApi).
 *
 * @param {object} lines
 * @return {Promise<object>} `{model, session, sent}`; `sent` lists the ops
 *   the page sent after the model opened
 */
async function sessionModel(lines) {
  const {getItemProperties} = engineReads(lines)
  const api = {
    wasmModule: undefined,
    async Init() {
      this.wasmModule = {HEAPU8: {byteLength: 16}}
    },
    async OpenModelStreamed() {
      return 0
    },
    IsModelOpen: () => true,
    CloseModel: () => null,
    properties: {getItemProperties, getPropertySets: async () => [lines[9030]]},
  }
  const transport = makeInProcessTransport((post) => createEngineHandler({
    loadIfcAPI: async () => function IfcAPI() {
      return api
    },
    post,
  }))
  const sent = []
  const realPost = transport.post
  transport.post = (msg, transfer) => {
    sent.push(msg.op)
    realPost(msg, transfer)
  }
  const session = new EngineSession(transport)
  await session.init()
  await session.open({bytes: new Uint8Array(4)})
  sent.length = 0
  const facade = {properties: session.propertiesApi}
  const model = {
    getItemProperties: (id, recursive = false) => facade.properties.getItemProperties(0, id, recursive),
    ifcManager: {ifcAPI: facade},
  }
  return {model, session, sent}
}


/**
 * @param {object} element a React element
 * @return {string} its rendered HTML
 */
function html(element) {
  const {container, unmount} = render(<div>{element}</div>)
  const out = container.innerHTML
  unmount()
  return out
}


describe('Properties tables resolved in the engine session (Share#2070)', () => {
  it('renders the same table as the main-thread engine', async () => {
    const lines = gridLines()
    const local = html(await createPropertyTable(mainThreadModel(lines), structuredClone(lines[9010])))
    const {model, session} = await sessionModel(lines)
    const remote = html(await createPropertyTable(model, structuredClone(lines[9010])))
    session.close()
    // Not an empty-equals-empty pass: the table holds what both resolved.
    expect(local).toContain('Gridaxis')
    expect(local).toContain('é')
    expect(local).toContain('Wall 0wall0000000000000000A')
    expect(local).toContain(`… and 20 more`)
    expect(remote).toBe(local)
  })

  it('costs one request for the whole table, not one read per reference', async () => {
    const lines = gridLines()
    const {model, session, sent} = await sessionModel(lines)
    await createPropertyTable(model, structuredClone(lines[9010]))
    session.close()
    // Per reference this was: UAxes 2 + VAxes 1 + Neighbour 1 +
    // MAX_ARRAY_MEMBERS of Samples' 70 = 54 PROPS round trips.
    expect(sent).toEqual([Op.PROPERTY_TABLES])
  })

  it('resolves every property set in one request', async () => {
    const lines = gridLines()
    const {model, session, sent} = await sessionModel(lines)
    const psets = [structuredClone(lines[9030]), structuredClone(lines[9030])]
    const tables = await createPropertyTables(model, psets.map((record) => ({record, isPset: true})))
    session.close()
    expect(sent).toEqual([Op.PROPERTY_TABLES])
    expect(tables).toHaveLength(2)
    render(<div>{tables}</div>)
    expect(screen.getAllByText('Spacing')).toHaveLength(2)
    expect(screen.getAllByText('SW')).toHaveLength(2)
  })

  it('falls back to per-read requests against an engine that does not offer the op', async () => {
    const lines = gridLines()
    const {model, session, sent} = await sessionModel(lines)
    // A stale worker bundle: its init reply named no `propertyTables`.
    session.capabilities = {...session.capabilities, propertyTables: undefined}
    expect(session.propertiesApi.resolvePropertyTables).toBeUndefined()
    const table = html(await createPropertyTable(model, structuredClone(lines[9010])))
    session.close()
    expect(table).toContain('Gridaxis')
    expect(sent).not.toContain(Op.PROPERTY_TABLES)
    expect(sent.filter((op) => op === Op.PROPS).length).toBeGreaterThan(1)
  })

  it('resolves on the page a record that cannot cross to the engine', async () => {
    const lines = gridLines()
    const {model, session, sent} = await sessionModel(lines)
    // A spatial-tree node the NavTree decorated with a callback, say.
    const record = {...structuredClone(lines[9010]), onToggle: () => null}
    const table = html(await createPropertyTable(model, record))
    session.close()
    expect(table).toContain('Gridaxis')
    expect(sent[0]).toBe(Op.PROPERTY_TABLES)
    expect(sent.slice(1)).toContain(Op.PROPS)
  })
})


describe('propertyTable.js deref agrees with ifclib\'s', () => {
  it('gives every value ifclib resolves the node ifclib\'s result renders as', async () => {
    const lines = gridLines()
    const {readLine, getItemProperties} = engineReads(lines)
    const reader = {
      read: (id, recursive) => getItemProperties(0, id, recursive),
      readMember: (id) => getItemProperties(0, id, false),
      typeLookups: [schemaTypeName],
    }
    const grid = readLine(9010, false)
    const [table] = await resolvePropertyTables(reader, [{record: structuredClone(grid)}])
    const keys = ['Name', 'UAxes', 'VAxes', 'Neighbour', 'Samples', 'Labels']
    for (const key of keys) {
      const row = table.rows.find((r) => r.label === key)
      // ifclib's deref, untouched (its full closure, no array cut), then the
      // same rendering cut.
      const theirs = await resolveValue(
        reader, await deref(structuredClone(grid[key]), {properties: {getItemProperties}}), 0)
      expect({key, value: row.value}).toEqual({key, value: theirs})
    }
  })
})


describe('Properties on a GLB cache hit (Share#2066)', () => {
  /**
   * A cache-hit model: `getItemProperties(id)` answers from the cached
   * records (shallow: references stay `{type: 5, value}`), returning the
   * SAME object every time, as bldrsElementProperties.js's LRU block cache
   * does; and `ifcManager.ifcAPI` is the viewer's engine, which has no
   * model open and so answers every read with undefined.
   *
   * @param {object} records
   * @return {object}
   */
  function cacheHitModel(records) {
    return {
      getItemProperties: async (id) => records[id],
      ifcManager: {ifcAPI: {properties: {getItemProperties: async () => undefined}}},
    }
  }

  it('resolves references from its own records, not the viewer\'s empty engine', async () => {
    const records = gridLines()
    render(await createPropertyTable(cacheHitModel(records), structuredClone(records[9010])))
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('C')).toBeInTheDocument()
    expect(screen.getAllByText('Gridaxis')).toHaveLength(3)
    expect(screen.getByText('Wall 0wall0000000000000000A')).toBeInTheDocument()
    expect(screen.queryByText('null')).not.toBeInTheDocument()
  })

  it('shows a reference outside the cached records as its #id', async () => {
    const records = gridLines()
    records[9010].Neighbour = ref(424242)
    render(await createPropertyTable(cacheHitModel(records), structuredClone(records[9010])))
    expect(screen.getByText('#424242')).toBeInTheDocument()
    expect(screen.queryByText('null')).not.toBeInTheDocument()
  })

  it('leaves the cached records as they were (they are shared)', async () => {
    const records = gridLines()
    const before = structuredClone(records)
    await createPropertyTable(cacheHitModel(records), structuredClone(records[9010]))
    expect(records).toEqual(before)
  })

  it('stops at a reference back up its own chain instead of looping', async () => {
    const records = {
      1: {expressID: 1, type: IFCWALL, Name: {type: STRING, value: 'root'}, Next: ref(2)},
      2: {expressID: 2, type: IFCGRIDAXIS, Next: ref(3)},
      3: {expressID: 3, type: IFCPOLYLINE, Next: ref(2)},
    }
    render(await createPropertyTable(cacheHitModel(records), structuredClone(records[1])))
    // 2 and 3 are the two nested tables; 3's Next is 2 again, still being
    // resolved, so it is shown by id.
    expect(screen.getByText('Gridaxis')).toBeInTheDocument()
    expect(screen.getByText('Polyline')).toBeInTheDocument()
    expect(screen.getByText('#2')).toBeInTheDocument()
  })
})
