test('MockViewer getProperties', () => {
  const testLabel = 'test label'
  const mv = new MockViewer({
    0: {
      type: 1,
      value: testLabel,
    },
  })
  const props = mv.getProperties(undefined, 0)
  expect(props.type).toEqual(1)
  expect(props.value).toEqual(testLabel)
})


test('MockViewer getIfcType', () => {
  expect(new MockViewer().IFC.loader.ifcManager.getIfcType(undefined, undefined)).toEqual('IFCELEMENT')
})


test('MockViewer getPropertySets', async () => {
  const val = await new MockViewer().IFC.loader.ifcManager.getPropertySets(undefined, undefined)
  expect(val).toEqual([])
})


export class MockViewer {
  constructor(propsById = {}) {
    this.propsById = propsById
    this.IFC = {
      loader: {
        ifcManager: {
          getPropertySets: (modelId, expressId) => {
            return new Promise((resolve, reject) => {
              resolve([])
            })
          },
          getIfcType: (elt, viewer) => 'IFCELEMENT',
        },
      },
    }
  }

  getProperties(modelId, id) {
    return this.propsById[id]
  }
}


export function newMockStringValueElt(label, id = 1) {
  return {
    children: [],
    expressID: id,
    Name: {
      type: 1,
      value: label,
    },
  }
}
