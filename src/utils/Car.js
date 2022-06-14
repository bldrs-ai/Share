// https://www.freecodecamp.org/news/three-js-tutorial/
import {
  BoxBufferGeometry,
  CylinderBufferGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
} from 'three'


/** A car for Markus */
export default class Car extends Group {
  /** ctor */
  constructor() {
    super()

    /** @return {object} wheel */
    function createWheel() {
      const radius = 0.8
      const width = 0.5
      const geometry = new CylinderBufferGeometry(radius, radius, width, 32 /* sections*/ )
      const material = new MeshLambertMaterial({color: 0x333333})
      const wheel = new Mesh(geometry, material)
      wheel.position.x = radius / 2
      wheel.rotateX(Math.PI / 2)
      wheel.position.y = 0.5
      return wheel
    }

    const backLeftWheel = createWheel()
    backLeftWheel.position.x = -1.8
    backLeftWheel.position.z = -1.4
    this.add(backLeftWheel)

    const backRightWheel = createWheel()
    backRightWheel.position.x = -1.8
    backRightWheel.position.z = 1.4
    this.add(backRightWheel)

    const frontLeftWheel = createWheel()
    frontLeftWheel.position.x = 1.8
    frontLeftWheel.position.z = -1.4
    this.add(frontLeftWheel)

    const frontRightWheel = createWheel()
    frontRightWheel.position.x = 1.8
    frontRightWheel.position.z = 1.4
    this.add(frontRightWheel)

    const main = new Mesh(
        new BoxBufferGeometry(6, 1.5, 3.0),
        new MeshLambertMaterial({color: 0x78b14b}))
    main.position.y = 1.2
    this.add(main)

    const cabin = new Mesh(
        new BoxBufferGeometry(3.3, 1.2, 2.4),
        new MeshLambertMaterial({color: 0xffffff}))
    cabin.position.x = -0.6
    cabin.position.y = 2.55
    this.add(cabin)
  }
}
