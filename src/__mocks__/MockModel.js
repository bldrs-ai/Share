import {Vector3} from 'three'

/* eslint-disable no-magic-numbers */
export const ifcModel = {
  center: new Vector3(0, 0, 0),
  geometry: {
    boundingBox: {
      max: {
        x: 10,
        y: 30,
        z: 12,
      },
      min: {
        x: -76,
        y: 0,
        z: -23,
      },
    },
  },
}

/* eslint-disable no-magic-numbers */
// export const ifcModel = {
//   geometry: {
//     boundingBox: {
//       max: new Vector3(10, 30, 12),
//       min: new Vector3(-76, 0, -23),
//     },
//   },
// }
