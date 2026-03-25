import FloorPlanManager from './FloorPlanManager'


jest.mock('three')


describe('FloorPlanManager', () => {
  const mockViewer = {
    context: {
      getScene: jest.fn(() => ({add: jest.fn(), remove: jest.fn()})),
      getCamera: jest.fn(() => ({position: {clone: jest.fn()}})),
      getRenderer: jest.fn(() => ({clippingPlanes: [], localClippingEnabled: false})),
    },
    clipper: {
      context: {
        addClippingPlane: jest.fn(),
        removeClippingPlane: jest.fn(),
      },
      updateMaterials: jest.fn(),
    },
    IFC: {
      context: {
        ifcCamera: {
          cameraControls: {
            getPosition: jest.fn(() => ({x: 0, y: 10, z: 20})),
            getTarget: jest.fn(() => ({x: 0, y: 0, z: 0})),
            setPosition: jest.fn(),
            setTarget: jest.fn(),
          },
        },
      },
      loader: {
        ifcManager: {
          getSpatialStructure: jest.fn(() => Promise.resolve({
            type: 'IFCPROJECT',
            children: [{
              type: 'IFCSITE',
              children: [{
                type: 'IFCBUILDING',
                Name: {type: 1, value: 'Test Building'},
                children: [
                  {
                    type: 'IFCBUILDINGSTOREY',
                    expressID: 100,
                    Name: {type: 1, value: 'Ground Floor'},
                    properties: {Elevation: {type: 4, value: '0'}},
                    children: [],
                  },
                  {
                    type: 'IFCBUILDINGSTOREY',
                    expressID: 200,
                    Name: {type: 1, value: 'First Floor'},
                    properties: {Elevation: {type: 4, value: '3.5'}},
                    children: [],
                  },
                ],
              }],
            }],
          })),
        },
      },
    },
  }

  const mockModel = {}

  let manager

  beforeEach(() => {
    mockViewer.IFC.loader.ifcManager.getSpatialStructure.mockClear()
    manager = new FloorPlanManager(mockViewer, mockModel)
  })

  it('initializes inactive', () => {
    expect(manager.active).toBe(false)
  })

  it('getFloors returns sorted storeys with nextElevation', async () => {
    const floors = await manager.getFloors()
    expect(floors).toHaveLength(2)
    expect(floors[0].name).toBe('Ground Floor')
    expect(floors[0].elevation).toBe(0)
    // nextElevation = next storey's elevation (3.5)
    // unitScale=1 in test (mocked Box3 returns no valid bounds)
    expect(floors[0].nextElevation).toBe(3.5)
    expect(floors[0].buildingName).toBe('Test Building')
    expect(floors[1].name).toBe('First Floor')
    expect(floors[1].elevation).toBe(3.5)
  })

  it('getFloors caches result', async () => {
    await manager.getFloors()
    await manager.getFloors()
    // getSpatialStructure should only be called once
    expect(mockViewer.IFC.loader.ifcManager.getSpatialStructure).toHaveBeenCalledTimes(1)
  })

  it('getFloors unwraps IFC typed values', async () => {
    const floors = await manager.getFloors()
    // Name should be a plain string, not {type, value}
    expect(typeof floors[0].name).toBe('string')
    expect(typeof floors[0].globalId).toBe('string')
    expect(typeof floors[0].elevation).toBe('number')
  })
})
