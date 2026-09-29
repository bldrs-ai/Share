/* eslint-disable no-magic-numbers */
import {BufferAttribute, BufferGeometry, Group, Mesh, MeshLambertMaterial, MeshStandardMaterial} from 'three'
import {STLLoader} from 'three/examples/jsm/loaders/STLLoader.js'
import stlToThree from './stl'


/** @return {BufferGeometry} minimal indexed geometry with a duplicate vertex */
function makeDedupableGeometry() {
  const geometry = new BufferGeometry()
  const positions = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
    0, 0, 0, // duplicate of vertex 0
  ])
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setIndex([0, 1, 2, 3, 1, 2])
  return geometry
}


const STL_HEADER_BYTES = 80
const STL_TRIANGLE_BYTES = 50
const STL_DATA_OFFSET = 84
// Where the 16-bit attribute word sits in a triangle record: after the
// normal and three vertices, 12 floats.
const STL_ATTRIBUTE_OFFSET = 48

// Two triangles sharing the edge (1,0,0)-(0,1,0), so mergeVertices has
// coincident vertices to weigh — and must keep them apart when the two
// faces' colors differ.
const TWO_TRIANGLES = [
  [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
  [[1, 0, 0], [1, 1, 0], [0, 1, 0]],
]

// The attribute word on every facet of the reported Saturn V part
// (`s-1c_u_red_x4.stl`): bit 15 clear → the facet's own color, packed
// Materialise-style as R bits 0-4, G 5-9, B 10-14 → 23/6/4 of 31, red.
const MATERIALISE_RED = 0x10D7
// Bit 15 set → "use the header's default COLOR=".
const USE_DEFAULT_COLOR = 0x8000
// Materialise's default, as that same file's header carries it.
const DEFAULT_RGBA = [0x19, 0x19, 0x19, 0xff]


/**
 * A binary STL, parsed by three's STLLoader exactly as Loader.js does.
 *
 * @param {object} opts
 * @param {number[]|null} opts.colorRgba header `COLOR=` bytes, or null for
 *   an all-zero header (the Printables Dodge Challenger's)
 * @param {number[]} opts.attributes one 16-bit attribute word per triangle
 * @return {BufferGeometry}
 */
function parseBinaryStl({colorRgba, attributes}) {
  const bytes = new Uint8Array(STL_DATA_OFFSET + (TWO_TRIANGLES.length * STL_TRIANGLE_BYTES))
  const view = new DataView(bytes.buffer)
  if (colorRgba) {
    const tag = 'COLOR='
    for (let i = 0; i < tag.length; i++) {
      bytes[i] = tag.charCodeAt(i)
    }
    colorRgba.forEach((b, i) => {
      bytes[tag.length + i] = b
    })
  }
  view.setUint32(STL_HEADER_BYTES, TWO_TRIANGLES.length, true)
  TWO_TRIANGLES.forEach((triangle, t) => {
    const start = STL_DATA_OFFSET + (t * STL_TRIANGLE_BYTES)
    // Normal (0, 0, 1), then the vertices.
    const floats = [0, 0, 1, ...triangle.flat()]
    floats.forEach((f, j) => view.setFloat32(start + (j * 4), f, true))
    view.setUint16(start + STL_ATTRIBUTE_OFFSET, attributes[t], true)
  })
  return new STLLoader().parse(bytes.buffer)
}


/**
 * The IEC 61966-2-1 sRGB → linear transfer, written out rather than taken
 * from three so the test pins the color-space decision in stl.js instead of
 * re-running whatever three does.
 *
 * @param {number} c sRGB component, 0..1
 * @return {number} linear component
 */
function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}


/**
 * Each triangle's three vertex colors, read through the merged geometry's
 * index.
 *
 * @param {BufferGeometry} geometry
 * @return {Array<Array<number[]>>} per triangle, per corner, [r, g, b]
 */
function triangleColors(geometry) {
  const color = geometry.getAttribute('color')
  const index = geometry.getIndex()
  const out = []
  for (let t = 0; t < index.count / 3; t++) {
    const corners = []
    for (let k = 0; k < 3; k++) {
      const v = index.getX((t * 3) + k)
      corners.push([color.getX(v), color.getY(v), color.getZ(v)])
    }
    out.push(corners)
  }
  return out
}


/**
 * @param {number[]} actual
 * @param {number[]} expected
 */
function expectRgbClose(actual, expected) {
  expect(actual.length).toBe(3)
  actual.forEach((c, i) => expect(c).toBeCloseTo(expected[i], 5))
}


describe('loader/stl', () => {
  it('wraps the geometry in a Group containing a single Mesh', () => {
    const root = stlToThree(makeDedupableGeometry())

    expect(root).toBeInstanceOf(Group)
    expect(root.children.length).toBe(1)
    expect(root.children[0]).toBeInstanceOf(Mesh)
  })


  it('tags the mesh with modelID=0 and exposes it as root.mesh', () => {
    const root = stlToThree(makeDedupableGeometry())

    expect(root.mesh).toBe(root.children[0])
    expect(root.children[0].modelID).toBe(0)
  })


  it('uses a MeshLambertMaterial', () => {
    const root = stlToThree(makeDedupableGeometry())
    expect(root.children[0].material).toBeInstanceOf(MeshLambertMaterial)
  })


  it('de-duplicates coincident vertices via mergeVertices', () => {
    const geometry = makeDedupableGeometry()
    expect(geometry.attributes.position.count).toBe(4)

    const root = stlToThree(geometry)
    expect(root.children[0].geometry.attributes.position.count).toBe(3)
  })


  describe('colors', () => {
    it('renders an STL with no COLOR= header exactly as before', () => {
      const geometry = parseBinaryStl({colorRgba: null, attributes: [0, 0]})
      expect(geometry.hasColors).toBeUndefined()

      const {material, geometry: merged} = stlToThree(geometry).mesh
      expect(material.vertexColors).toBe(false)
      expect(material.color.getHex()).toBe(0xabcdef)
      expect(material.transparent).toBe(false)
      expect(merged.getAttribute('color')).toBeUndefined()
    })


    it('paints per-face and default colors from the file, untinted', () => {
      const geometry = parseBinaryStl({
        colorRgba: DEFAULT_RGBA,
        attributes: [MATERIALISE_RED, USE_DEFAULT_COLOR],
      })

      const {material, geometry: merged} = stlToThree(geometry).mesh
      expect(material).toBeInstanceOf(MeshLambertMaterial)
      expect(material.vertexColors).toBe(true)
      // White base, or the vertex colors would be multiplied by 0xabcdef.
      expect(material.color.getHex()).toBe(0xffffff)
      expect(material.transparent).toBe(false)
      expect(material.opacity).toBe(1)

      // Stored linear: the 5-bit (and 8-bit) values are sRGB, and three
      // treats a color attribute as already in the linear working space.
      const red = [23 / 31, 6 / 31, 4 / 31].map(srgbToLinear)
      const grey = DEFAULT_RGBA.slice(0, 3).map((b) => srgbToLinear(b / 255))
      const [first, second] = triangleColors(merged)
      first.forEach((rgb) => expectRgbClose(rgb, red))
      second.forEach((rgb) => expectRgbClose(rgb, grey))
      // The shared edge's two vertices are coincident but differently
      // colored, so mergeVertices (which hashes every attribute) must have
      // kept them apart: 3 + 3, not 4.
      expect(merged.getAttribute('position').count).toBe(6)
    })


    it('takes the header alpha as opacity when it is below 1', () => {
      const alphaByte = 0x80
      const geometry = parseBinaryStl({
        colorRgba: [...DEFAULT_RGBA.slice(0, 3), alphaByte],
        attributes: [MATERIALISE_RED, MATERIALISE_RED],
      })

      const {material} = stlToThree(geometry).mesh
      expect(material.vertexColors).toBe(true)
      expect(material.transparent).toBe(true)
      expect(material.opacity).toBeCloseTo(alphaByte / 255, 5)
    })


    it('keeps a zero header alpha opaque rather than hiding the model', () => {
      const geometry = parseBinaryStl({
        colorRgba: [...DEFAULT_RGBA.slice(0, 3), 0],
        attributes: [MATERIALISE_RED, MATERIALISE_RED],
      })

      const {material} = stlToThree(geometry).mesh
      expect(material.vertexColors).toBe(true)
      expect(material.transparent).toBe(false)
      expect(material.opacity).toBe(1)
    })


    it('ignores a COLOR= header whose facets all decode to black', () => {
      const geometry = parseBinaryStl({colorRgba: [0, 0, 0, 0xff], attributes: [0, 0]})
      expect(geometry.hasColors).toBe(true)

      const {material, geometry: merged} = stlToThree(geometry).mesh
      expect(material.vertexColors).toBe(false)
      expect(material.color.getHex()).toBe(0xabcdef)
      expect(merged.getAttribute('color')).toBeUndefined()
    })


    it('uses vertex colors on the ?feature=look material too', () => {
      const geometry = parseBinaryStl({
        colorRgba: DEFAULT_RGBA,
        attributes: [MATERIALISE_RED, MATERIALISE_RED],
      })
      const originalUrl = window.location.href
      window.history.pushState({}, '', '/?feature=look')
      try {
        const {material} = stlToThree(geometry).mesh
        expect(material).toBeInstanceOf(MeshStandardMaterial)
        expect(material.userData.isLookManaged).toBe(true)
        expect(material.vertexColors).toBe(true)
        expect(material.color.getHex()).toBe(0xffffff)
      } finally {
        window.history.pushState({}, '', originalUrl)
      }
    })
  })
})
