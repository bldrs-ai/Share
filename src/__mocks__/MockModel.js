import {Vector3} from 'three'

/* eslint-disable no-magic-numbers */
const ifcModel = {
  geometry: {
    boundingBox: {
      min: new Vector3(2, 2, 2),
      max: new Vector3(10, 10, 10),
      getCenter: () => {
        return new Vector3(-33, 15, -5.613276958465576)
      },
    },
  },
}

export default ifcModel
