/* eslint-disable no-magic-numbers */
import {
  computeElementPathIds,
  expandedIdsForSelection,
  setupLookupAndParentLinks,
} from './TreeUtils'
import {v4 as uuidv4} from 'uuid'

/**
 *Helper to create a mock IFC doc object tree.
 *
 * @return {object} The mock IFC obj.
 */
export function makeTestTree() {
  return {
    name: 'a',
    expressID: 0,
    type: 'IFCTEST',
    children: [{
      name: 'b',
      expressID: 1,
      type: 'IFCTEST',
      children: [{
        name: 'c',
        expressID: 2,
        children: [],
      }],
    }],
  }
}


test('Test setupLookupAndParentLinks', () => {
  const tree = makeTestTree()
  const eltsById = {}
  setupLookupAndParentLinks(tree, eltsById)
  const a = tree
  const b = tree.children[0]
  const c = tree.children[0].children[0]
  expect(b).toEqual(c.parent)
  expect(a).toEqual(b.parent)
  expect(undefined).toEqual(a.parent)
  expect(a).toEqual(eltsById[0])
  expect(b).toEqual(eltsById[1])
  expect(c).toEqual(eltsById[2])
})


test('Test computeElementPathIds', () => {
  const tree = makeTestTree()
  const a = tree
  const b = tree.children[0]
  const c = tree.children[0].children[0]
  const getIdCb = (elt) => elt.name
  expect(computeElementPathIds(a, getIdCb)).toEqual(['a'])
  expect(computeElementPathIds(b, getIdCb)).toEqual(['b'])
  expect(computeElementPathIds(c, getIdCb)).toEqual(['c'])
  const eltsById = {}
  setupLookupAndParentLinks(tree, eltsById)
  expect(computeElementPathIds(a, getIdCb)).toEqual(['a'])
  expect(computeElementPathIds(b, getIdCb)).toEqual(['a', 'b'])
  expect(computeElementPathIds(c, getIdCb)).toEqual(['a', 'b', 'c'])
})


describe('expandedIdsForSelection', () => {
  it('reveals a STEP occurrence by opening root + occurrence path, merged additively', () => {
    // The occurrence path is the ancestor node-id chain; root is prepended.
    // Existing expansion (a sibling branch the user opened) must be preserved.
    const next = expandedIdsForSelection({
      prevExpanded: ['0', '999'],
      occurrencePath: [10, 20, 30],
      rootExpressId: 0,
      pathIds: null,
    })
    expect(next).toEqual(['0', '999', '10', '20', '30'])
  })

  it('does not collapse other open branches (no dropped ids, deduped)', () => {
    const next = expandedIdsForSelection({
      prevExpanded: ['0', '10'],
      occurrencePath: [10, 20],
      rootExpressId: 0,
      pathIds: null,
    })
    // '0' and '10' already present → not duplicated; '20' added.
    expect(next).toEqual(['0', '10', '20'])
  })

  it('falls back to parent-path ids for a non-occurrence (IFC) selection', () => {
    const next = expandedIdsForSelection({
      prevExpanded: ['500'],
      occurrencePath: null,
      rootExpressId: 0,
      pathIds: [0, 1, 2],
    })
    expect(next).toEqual(['500', '0', '1', '2'])
  })

  it('drops null/undefined ids (e.g. missing root) without crashing', () => {
    const next = expandedIdsForSelection({
      prevExpanded: [],
      occurrencePath: [10, 20],
      rootExpressId: undefined,
      pathIds: null,
    })
    expect(next).toEqual(['10', '20'])
  })
})


let nextExpressID = Math.floor(Math.random() * 100)

export const createFakeProject = ({expressId, name, longName}) => {
  const project = {
    LongName: null,
    Name: null,
    children: [],
    expressID: null,
    type: 'IFCPROJECT',
  }

  project.expressID = expressId || nextExpressID++

  if (name) {
    project.Name = {
      type: 1,
      value: name,
    }
  }

  if (longName) {
    project.LongName = {
      type: 1,
      value: longName,
    }
  }

  return project
}

export const createFakeSite = ({expressId, globalId, name, longName, parent}) => {
  const site = {
    CompositionType: {
      type: 3,
      value: 'ELEMENT',
    },
    Description: null,
    GlobalId: null,
    LandTitleNumber: null,
    LongName: null,
    Name: null,
    ObjectPlacement: {
      type: 5,
      value: -1,
    },
    ObjectType: null,
    OwnerHistory: {
      type: 5,
      value: 28,
    },
    RefElevation: null,
    RefLatitude: null,
    RefLongitude: null,
    Representation: null,
    SiteAddress: null,
    children: [],
    expressID: null,
    parent: parent || null,
    type: 'IFCSITE',
  }

  if (name) {
    site.Name = {
      type: 1,
      value: name,
    }
  }

  if (longName) {
    site.LongName = {
      type: 1,
      value: longName,
    }
  }

  site.expressID = expressId || nextExpressID++

  site.GlobalId = {
    type: 1,
    value: globalId || uuidv4(),
  }

  return site
}

export const createFakeBuilding = ({expressId, globalId, name, longName, parent}) => {
  const building = {
    BuildingAddress: null,
    CompositionType: {
      type: 3,
      value: 'ELEMENT',
    },
    Description: null,
    ElevationOfRefHeight: null,
    ElevationOfTerrain: null,
    GlobalId: null,
    LongName: null,
    Name: null,
    ObjectPlacement: {
      type: 5,
      value: -1,
    },
    ObjectType: null,
    OwnerHistory: {
      type: 5,
      value: 28,
    },
    Representation: null,
    children: [],
    expressID: null,
    type: 'IFCBUILDING',
  }

  if (name) {
    building.Name = {
      type: 1,
      value: name,
    }
  }

  if (longName) {
    building.LongName = {
      type: 1,
      value: longName,
    }
  }

  building.expressID = expressId || nextExpressID++

  building.GlobalId = {
    type: 1,
    value: globalId || uuidv4(),
  }

  return building
}

export const createFakeTree = () => {
  const project = createFakeProject({name: 'Fake Project'})

  const site = createFakeSite({parent: project, name: 'Fake Site'})
  project.children.push(site)

  const building = createFakeBuilding({parent: site, name: 'Fake Building'})
  site.children.push(building)

  return project
}
