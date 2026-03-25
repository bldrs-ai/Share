import {extractFloorPlanGeometry} from './GeometryExtractor'


describe('GeometryExtractor', () => {
  it('returns empty array when no storey found', async () => {
    const mockViewer = {
      IFC: {
        loader: {
          ifcManager: {
            getSpatialStructure: jest.fn(() => Promise.resolve({
              type: 'IFCPROJECT', expressID: 1, children: [],
            })),
          },
        },
      },
    }
    const result = await extractFloorPlanGeometry(mockViewer, 999, {})
    expect(result).toEqual([])
  })
})
