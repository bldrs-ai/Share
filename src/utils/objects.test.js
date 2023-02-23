import {
  deletePropertyRecursive,
  deleteStringValueMatchRecursive,
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
        shapes: [Array],
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
  it('deletePropertyRecursive', () => {
    const testObj = Object.assign({}, templateObj)
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
            shapes: [Array],
            curveSegments: 12,
          },
        ],
        uuids: [undefined, undefined],
      },
    })
  })
})
