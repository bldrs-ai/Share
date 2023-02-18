/**
 * create an ifc color object
 *
 * @param {number} r the red component of the color as a fraction between 0 and 1
 * @param {number} g the green component of the color as a fraction between 0 and 1
 * @param {number} b the blue component of the color as a fraction between 0 and 1
 * @param {number} o the opacity component of the color as a fraction between 0 and 1
 */
export default function IfcColor(r = 0, g = 0, b = 0, o = 1) {
  this.x = r
  this.y = g
  this.z = b
  this.w = o
}
