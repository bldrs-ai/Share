import {
  computeElementPathIds,
  setupLookupAndParentLinks,
} from './TreeUtils'
import {nanoid} from 'nanoid'


let nextExpressID = Math.floor(Math.random() * 100)

const fakeElement = {
  expressID: 112,
  type: 'IFCSITE',
  CompositionType: null,
  Description: null,
  ElevationOfRefHeight: null,
  ElevationOfTerrain: null,
  GlobalId: {
    type: 1,
    value: '',
  },
  LandTitleNumber: null,
  Name: {
    type: 1,
    value: '',
  },
  ObjectPlacement: {
    type: 5,
    value: 109,
  },
  ObjectType: null,
  OwnerHistory: {
    type: 5,
    value: 28,
  },
  PredefinedType: {
    type: 3,
    value: 'NOTDEFINED',
  },
  RefElevation: {
    type: 4,
    value: 0,
  },
  RefLatitude: [
    {type: 4, value: 46},
    {type: 4, value: 54},
    {type: 4, value: 0},
    {type: 4, value: 0},
  ],
  RefLongitude: [
    {type: 4, value: 8},
    {type: 4, value: 15},
    {type: 4, value: 0},
    {type: 4, value: 0},
  ],
  Representation: null,
  SiteAddress: {
    type: 5,
    value: 1,
  },
  Tag: {
    type: 1,
    value: 'uuid',
  },
  children: [

  ],
  parent: {},
}

/**
 *Helper to create a mock IFC doc object tree.
 *
 * @return {object} The mock IFC obj.
 */
export function makeTestTree() {
  return {
    name: 'a',
    expressID: 0,
    children: [{
      name: 'b',
      expressID: 1,
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
    value: globalId || nanoid(),
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
    value: globalId || nanoid(),
  }

  return building
}

export const createFakeTree = () => {
  const project = createFakeProject({name: 'Fake Project'})

  const site = createFakeSite({parent: project, name: 'Fake Site'})
  project.children.push(site)

  const building = createFakeBuilding({parent: site, name: 'Fake Building'})
  site.children.push(building)

  // const floor = createFakeBuildingFloor({parent: building})

  return project
}
