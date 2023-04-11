import {
  deepCloneObject,
  deletePropertyRecursive,
  deleteStringValueMatchRecursive,
  filterObject,
} from './objects'
import {UUID_REGEX} from './strings'


const templateObj = {
  a: 1,
  b: 2,
  uuid: 3,
  arr: [
    {
      foo: 'a',
      bar: 'b',
      uuid: 'c',
    },
  ],
  foo: {
    geometries: [
      {
        uuid: 'ADD77535-D1B6-49A9-915B-41343B08BF83',
        type: 'ShapeGeometry',
        shapes: [],
        curveSegments: 12,
      },
    ],
    uuids: [
      'ADD77535-D1B6-49A9-915B-41343B08BF83',
      'FDD77535-D1B6-49A9-915B-41343B08BF83',
    ],
  },
}


describe('objects util', () => {
  it('deepCloneObject', () => {
    const clonedObj = deepCloneObject(templateObj)
    expect(clonedObj).toStrictEqual(templateObj)
  })

  it('deletePropertyRecursive and deleteStringValueMatchRecursive', () => {
    const testObj = deepCloneObject(templateObj)
    deletePropertyRecursive(testObj, 'uuid')
    deleteStringValueMatchRecursive(testObj, UUID_REGEX)
    expect(testObj).toStrictEqual({
      a: 1,
      b: 2,
      arr: [
        {
          foo: 'a',
          bar: 'b',
        },
      ],
      foo: {
        geometries: [
          {
            type: 'ShapeGeometry',
            shapes: [],
            curveSegments: 12,
          },
        ],
        uuids: [undefined, undefined],
      },
    })
  })

  it('filterObject removes a single name/value pair', () => {
    const testObj = {a: 1, b: 2, c: 3}
    const filteredObject = filterObject(testObj, (val, key) => {
      if (val === 1 && key === 'a') {
        return false
      }
      return true
    })
    expect(filteredObject).toStrictEqual({b: 2, c: 3})
  })
})
