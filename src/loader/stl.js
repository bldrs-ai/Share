import {BufferGeometry, Group, Mesh} from 'three'
import {mergeVertices} from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {makeSurfaceMaterial, makeSurfaceVertexColors} from '../viewer/lookMaterial'


// What an STL with no color of its own has always rendered as.
const DEFAULT_STL_COLOR = 0xabcdef
// The base under vertex colors. Material color multiplies the color
// attribute in the shader, so anything but white would tint the file's
// colors.
const UNTINTED = 0xffffff


/**
 * Wrap an STLLoader geometry in the Share model shape, rendering the file's
 * colors when it carries any.
 *
 * Colors come only from binary STL's Materialise convention, which three's
 * STLLoader already decodes: a `COLOR=rgba` run in the 80-byte header turns
 * it on, and then each facet's 16-bit attribute word is either its own color
 * (bit 15 clear; R bits 0-4, G 5-9, B 10-14, each /31) or "use the header
 * default" (bit 15 set). The loader writes those into a per-vertex `color`
 * attribute and flags the geometry `hasColors` + `alpha` (the header's A
 * byte). The other vendor convention (VisCAM/SolidView: no header tag, bit 15
 * SET means valid, BGR order) is not decoded by STLLoader and so still
 * renders in the default color. ASCII STL has no colors.
 *
 * Color space. The 5-bit and header values are display (sRGB) values, and
 * STLLoader stores them converted to the linear working space
 * (`color.setRGB(r, g, b, SRGBColorSpace)`, with `ColorManagement.enabled`
 * set in ShareViewer.js). Whether linear is what the attribute should hold
 * depends on the render pipeline, which `?feature=look` switches — the same
 * split `makeSurfaceColor` makes for IFC colors — so it goes through
 * `makeSurfaceVertexColors` (lookMaterial.js):
 *  - look on: output is sRGB-encoded, so linear is right and the attribute
 *    is used as parsed.
 *  - look off (the default): the legacy pipeline writes the working space
 *    straight to the screen (`outputColorSpace = LinearSRGBColorSpace`), so
 *    a linear attribute displays gamma-darkened — the Saturn V red
 *    (23, 6, 4)/31 showed R≈130 where the file means 189. The values are
 *    converted back to sRGB, which that output then shows as authored, as
 *    IFC's colors are with the look off.
 * The uncolored default (`DEFAULT_STL_COLOR`) does not go through this: a hex
 * is read as sRGB and converted to linear, so with the look off it displays
 * darker than 0xabcdef. That is how every uncolored STL has always looked,
 * and changing it is a separate decision from rendering file colors as
 * authored.
 *
 * `hasColors` and `alpha` are plain properties on the input geometry and are
 * read BEFORE `mergeVertices`, which returns a fresh BufferGeometry without
 * them. mergeVertices hashes every attribute, color included, so coincident
 * vertices of differently-colored facets stay separate and per-face colors
 * survive the merge.
 *
 * @param {BufferGeometry} stlGeometry
 * @return {Group} holding the one Mesh, also exposed as `root.mesh`
 */
export default function stlToThree(stlGeometry) {
  const hasColors = stlGeometry.hasColors === true &&
    !isAllBlack(stlGeometry.getAttribute('color'))
  if (stlGeometry.hasColors && !hasColors) {
    // A COLOR= header over facets that all decode to black is far more
    // likely an exporter writing the tag without colors than a black part,
    // and honoring it would turn a file that has always rendered blue-grey
    // into a black silhouette. Drop the attribute so the merge and material
    // are exactly the uncolored path's. Only the ALL-black case is caught: a
    // partial misfire — bit-15 (header default) facets mixed with 0x0000
    // facets — keeps its colors, and the 0x0000 facets render black, which
    // is what Materialise's rules say they are.
    stlGeometry.deleteAttribute('color')
  }
  const alpha = stlGeometry.alpha
  stlGeometry = mergeVertices(stlGeometry)
  if (hasColors) {
    // After the merge: fewer vertices to convert, and the conversion is
    // per-value, so it can't change which vertices the merge would unify.
    makeSurfaceVertexColors(stlGeometry.getAttribute('color'))
  }
  const mesh = new Mesh(
    stlGeometry,
    makeSurfaceMaterial(hasColors ? colorMaterialOpts(alpha) : {color: DEFAULT_STL_COLOR}),
  )
  const root = new Group()
  root.add(mesh)
  mesh.modelID = 0
  root.mesh = mesh
  return root
}


/**
 * Material options for a colored STL. Opacity only when the header alpha is
 * strictly between 0 and 1: 1 is the common case and needs no blending pass,
 * and 0 would hide the whole model — never what someone opening the file
 * wants, and more likely an exporter that wrote only RGB meaning than a
 * deliberately invisible part.
 *
 * @param {number|undefined} alpha header alpha, 0..1
 * @return {object} options for makeSurfaceMaterial
 */
function colorMaterialOpts(alpha) {
  const opts = {color: UNTINTED, vertexColors: true}
  if (alpha > 0 && alpha < 1) {
    opts.transparent = true
    opts.opacity = alpha
  }
  return opts
}


/**
 * @param {object|undefined} colorAttr BufferAttribute
 * @return {boolean} true when every component is zero (or there is none)
 */
function isAllBlack(colorAttr) {
  if (!colorAttr) {
    return true
  }
  const {array} = colorAttr
  for (let i = 0; i < array.length; i++) {
    if (array[i] !== 0) {
      return false
    }
  }
  return true
}
