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
  expect(new MockViewer().IFC.loader.ifcManager
      .getIfcType(undefined, undefined))
      .toEqual('IFCELEMENT')
})


test('MockViewer getPropertySets', async () => {
  const val = await new MockViewer().IFC.loader.ifcManager.getPropertySets(undefined, undefined)
  expect(val).toEqual([])
})


/** Create a mock IFC model */
export class MockModel {
  /** @param {object} propsById Mock IFC properties. */
  constructor(propsById = {}) {
    this.propsById = propsById
  }


  /**
   * @param {number} expressId
   * @return {object}
   */
  getItemProperties(expressId) {
    return this.propsById[expressId]
  }


  /**
   * @param {number} expressId
   * @return {Promise}
   */
  getPropertySets(expressId) {
    return new Promise((resolve, reject) => {
      resolve([])
    })
  }


  /**
   * @param {object} elt IFC element
   * @param {object} viewer IfcViewerAPIExtended instance
   * @return {string}
   */
  getIfcType(elt, viewer) {
    return 'IFCELEMENT'
  }
}


/** Create a mock IFC viewer */
export class MockViewer {
  /** @param {object} propsById Mock IFC properties. */
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

  /**
   * Get the IFC type.
   *
   * @param {string} modelId
   * @param {string} id
   * @return {object} returns property object
   */
  getProperties(modelId, id) {
    return this.propsById[id]
  }
}

/**
 * Create a mock element with the given label.
 *
 * @param {string} label
 * @param {number} id Express ID for the element.
 * @return {object} Mock IFC element
 */
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
