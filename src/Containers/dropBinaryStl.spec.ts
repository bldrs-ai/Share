import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {homepageSetup, returningUserVisitsHomepageWaitForModel} from '../tests/e2e/utils'


/**
 * Dropping a binary STL onto the viewer opens it (bldrs-ai/test-models#69).
 *
 * The drop seam (`utils/dragAndDrop.js`) types a file by its bytes alone, and
 * binary STL has no magic number — its 80-byte header is free text, all
 * zeros in the Printables export that was reported. Until the sniffer learned
 * binary STL's structure (`Filetype.js#looksLikeBinaryStl`) such a drop was
 * rejected as an unknown type, with nothing in the console to say which file.
 *
 * The file is built here rather than committed: an all-zero header, a count,
 * and a tetrahedron. The assertions are on what the user gets — the upload
 * route's `.stl` storage extension (which IS the sniffed type) and the
 * tetrahedron's four triangles in the loaded model — not on the sniff.
 *
 * The Saturn V parts in that same report carry Materialise colors (a
 * `COLOR=` header, a color in each facet's attribute word), which
 * `loader/stl.js` renders. The color test drops a red cube and reads the pixel
 * under it: before the colors were wired, the cube rendered in Share's
 * default blue-grey, which this assertion rejects.
 */

const TEST_TIMEOUT_MS = 60_000
const LOAD_TIMEOUT_MS = 30_000

const STL_HEADER_BYTES = 80
const STL_COUNT_BYTES = 4
const STL_TRIANGLE_BYTES = 50
const FLOAT_BYTES = 4
// Where the 16-bit attribute word sits in a triangle record: after the
// normal and three vertices, 12 floats.
const STL_ATTRIBUTE_OFFSET = 48

// A unit tetrahedron, one outward-facing triangle per row.
const TETRAHEDRON: Array<Array<[number, number, number]>> = [
  [[0, 0, 0], [0, 1, 0], [1, 0, 0]],
  [[0, 0, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
]

type Triangle = Array<[number, number, number]>

// A unit cube, two outward-facing triangles per face. Unlike the
// tetrahedron, the centre of its bounds is inside it, so the pixel there is
// the model's from any viewing direction the camera fit picks.
const CUBE_CORNERS: Array<[number, number, number]> = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
]
const CUBE: Triangle[] = [
  [0, 3, 2], [0, 2, 1], // z = 0
  [4, 5, 6], [4, 6, 7], // z = 1
  [0, 1, 5], [0, 5, 4], // y = 0
  [3, 7, 6], [3, 6, 2], // y = 1
  [0, 4, 7], [0, 7, 3], // x = 0
  [1, 2, 6], [1, 6, 5], // x = 1
].map((corners) => corners.map((i) => CUBE_CORNERS[i]) as Triangle)

// Materialise per-facet color, as on every facet of the reported Saturn V
// part (`s-1c_u_red_x4.stl`): bit 15 clear, R bits 0-4, G 5-9, B 10-14 →
// 23/6/4 of 31, a red.
const MATERIALISE_RED = 0x10D7
// That file's header tag: `COLOR=` then Materialise's default RGBA, a dark
// grey no facet here uses (bit 15 is clear on all of them).
const MATERIALISE_DEFAULT_RGBA = [0x19, 0x19, 0x19, 0xff] // eslint-disable-line no-magic-numbers
const COLOR_HEADER = [...Array.from(new TextEncoder().encode('COLOR=')), ...MATERIALISE_DEFAULT_RGBA]


/**
 * A binary STL. By default the header is 80 zero bytes, as the reported
 * Printables file's is, and every attribute word is zero — no color.
 *
 * @param triangles the facets, each three [x, y, z] corners
 * @param opts header bytes to start the header with, and the attribute word
 *   to give every facet
 * @return the whole file, as a plain array so it crosses `page.evaluate`
 */
function binaryStlBytes(
  triangles: Triangle[] = TETRAHEDRON,
  {header = [], attribute = 0}: {header?: number[], attribute?: number} = {},
): number[] {
  const bytes = new Uint8Array(
    STL_HEADER_BYTES + STL_COUNT_BYTES + (triangles.length * STL_TRIANGLE_BYTES))
  bytes.set(header)
  const view = new DataView(bytes.buffer)
  view.setUint32(STL_HEADER_BYTES, triangles.length, true)
  triangles.forEach((triangle, i) => {
    const start = STL_HEADER_BYTES + STL_COUNT_BYTES + (i * STL_TRIANGLE_BYTES)
    // The facet normal, then the three vertices. A real normal matters for
    // the color test: STLLoader passes it through as the vertex normal, and
    // a zero one leaves a lit material black whatever its color.
    const floats = [...faceNormal(triangle), ...triangle.flat()]
    floats.forEach((f, j) => view.setFloat32(start + (j * FLOAT_BYTES), f, true))
    view.setUint16(start + STL_ATTRIBUTE_OFFSET, attribute, true)
  })
  return Array.from(bytes)
}


/**
 * @param triangle three [x, y, z] corners, counter-clockwise seen from outside
 * @return the unit outward normal
 */
function faceNormal([a, b, c]: Triangle): [number, number, number] {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
  const n: [number, number, number] = [
    (u[1] * v[2]) - (u[2] * v[1]),
    (u[2] * v[0]) - (u[0] * v[2]),
    (u[0] * v[1]) - (u[1] * v[0]),
  ]
  const len = Math.hypot(...n) || 1
  return [n[0] / len, n[1] / len, n[2] / len]
}


/**
 * Drop one file onto the viewer, the way a browser delivers it.
 *
 * @param page Playwright page
 * @param bytes the file's contents
 * @param name the file's name
 */
async function dropFile(page: Page, bytes: number[], name: string) {
  await page.evaluate(({bytesArg, nameArg}) => {
    const dropzone = document.querySelector('[data-testid="cadview-dropzone"]')
    if (!dropzone) {
      throw new Error('Drop target not found')
    }
    const dt = new DataTransfer()
    dt.items.add(new File([new Uint8Array(bytesArg)], nameArg))
    dropzone.dispatchEvent(new DragEvent('drop', {bubbles: true, cancelable: true, dataTransfer: dt}))
  }, {bytesArg: bytes, nameArg: name})
}


/**
 * Triangles in the model the viewer has loaded, or -1 while there is none.
 *
 * @param page Playwright page
 * @return triangle count across the model's meshes
 */
function loadedTriangleCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    type Geometry = {index: {count: number} | null, attributes: {position?: {count: number}}}
    type Node = {isMesh?: boolean, geometry?: Geometry, traverse: (cb: (n: Node) => void) => void}
    const store = (window as unknown as {store?: {getState: () => {model?: Node | null}}}).store
    const model = store?.getState().model
    if (!model || typeof model.traverse !== 'function') {
      return -1
    }
    let triangles = 0
    model.traverse((node) => {
      if (node.isMesh && node.geometry) {
        const g = node.geometry
        triangles += (g.index ? g.index.count : (g.attributes.position?.count ?? 0)) / 3
      }
    })
    return triangles
  })
}


/**
 * Where the loaded model's bounds centre lands on the page, in CSS pixels,
 * or null while there is no model.
 *
 * @param page Playwright page
 * @return page coordinates of the projected centre
 */
function modelCentreOnPage(page: Page): Promise<{x: number, y: number} | null> {
  return page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const state = (window as any).store?.getState()
    const mesh = state?.model?.mesh
    const camera = state?.viewer?.context?.getCamera?.()
    const canvas = document.querySelector('canvas')
    if (!mesh || !camera || !canvas) {
      return null
    }
    mesh.geometry.computeBoundingBox()
    mesh.updateMatrixWorld(true)
    // three's Vector3, without importing three into the page.
    const p = mesh.geometry.boundingBox.getCenter(camera.position.clone())
      .applyMatrix4(mesh.matrixWorld).project(camera)
    const rect = canvas.getBoundingClientRect()
    return {
      x: rect.left + (((p.x + 1) / 2) * rect.width),
      y: rect.top + (((1 - p.y) / 2) * rect.height),
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })
}


/**
 * The rendered color around a page point: the mean of a small screenshot
 * patch, decoded in the page so the spec needs no PNG library.
 *
 * Read from a screenshot rather than the WebGL buffer because the renderer
 * does not preserve its drawing buffer, so `readPixels` outside a frame
 * returns zeros; a screenshot is what the user sees.
 *
 * @param page Playwright page
 * @param point page coordinates
 * @return mean [r, g, b], 0..255
 */
async function renderedRgbAt(page: Page, point: {x: number, y: number}): Promise<number[]> {
  const half = 2
  const png = await page.screenshot({
    clip: {x: point.x - half, y: point.y - half, width: (2 * half) + 1, height: (2 * half) + 1},
  })
  return page.evaluate(async (base64) => {
    const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob()
    const bitmap = await createImageBitmap(blob)
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D
    ctx.drawImage(bitmap, 0, 0)
    const {data} = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
    const sum = [0, 0, 0]
    for (let i = 0; i < data.length; i += 4) {
      sum[0] += data[i]
      sum[1] += data[i + 1]
      sum[2] += data[i + 2]
    }
    const n = data.length / 4
    return sum.map((c) => Math.round(c / n))
  }, png.toString('base64'))
}


/**
 * Drop a cube and wait for the viewer to show it.
 *
 * @param page Playwright page
 * @param bytes the STL
 * @return the rendered color at the cube's centre, once it is drawn
 */
async function dropCubeAndSample(page: Page, bytes: number[]): Promise<number[]> {
  // The demo model has far more triangles than the cube, so the poll below
  // cannot pass on the model that was there before the drop.
  expect(await loadedTriangleCount(page)).toBeGreaterThan(CUBE.length)
  await dropFile(page, bytes, 'cube.stl')
  // The drop navigates to the upload's route; evaluating before that
  // settles races the page being torn down under the probe.
  await expect(page).toHaveURL(/\/share\/v\/new\/[0-9a-f-]+\.stl$/i, {timeout: LOAD_TIMEOUT_MS})
  await expect.poll(() => loadedTriangleCount(page), {timeout: LOAD_TIMEOUT_MS}).toBe(CUBE.length)
  const centre = await modelCentreOnPage(page)
  expect(centre).not.toBeNull()
  // The camera fit animates, so sample until two reads agree rather than
  // taking the first frame after load.
  let previous: number[] = []
  let rgb: number[] = []
  await expect.poll(async () => {
    previous = rgb
    rgb = await renderedRgbAt(page, centre as {x: number, y: number})
    return rgb.join() === previous.join()
  }, {timeout: LOAD_TIMEOUT_MS}).toBe(true)
  return rgb
}


describeMobileAndDesktop('Drop a binary STL', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await returningUserVisitsHomepageWaitForModel(page)
  })

  test('opens a binary STL whose header says nothing', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    // The demo model is loaded, and has far more than four triangles, so the
    // poll below cannot pass on the model that was there before the drop.
    expect(await loadedTriangleCount(page)).toBeGreaterThan(TETRAHEDRON.length)

    await dropFile(page, binaryStlBytes(), 'part.stl')

    // The upload's storage extension is the sniffed type.
    await expect(page).toHaveURL(/\/share\/v\/new\/[0-9a-f-]+\.stl$/i, {timeout: LOAD_TIMEOUT_MS})
    await expect.poll(() => loadedTriangleCount(page), {timeout: LOAD_TIMEOUT_MS})
      .toBe(TETRAHEDRON.length)
  })

  test('says so, on screen and in the console, when a drop is not a model', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    const warnings: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'warning') {
        warnings.push(msg.text())
      }
    })
    // Text no sniff claims, and short of the 84 bytes a binary STL needs.
    await dropFile(page, Array.from(new TextEncoder().encode('just notes')), 'notes.bin')

    await expect(page.getByText(/File upload of unknown type/)).toBeVisible()
    // The console names the file, which the alert does not (dragAndDrop.js).
    await expect.poll(() => warnings.some((w) => w.includes('"notes.bin" (10 bytes)'))).toBe(true)
  })

  test('renders the colors a Materialise-colored STL carries', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    const [r, g, b] = await dropCubeAndSample(
      page, binaryStlBytes(CUBE, {header: COLOR_HEADER, attribute: MATERIALISE_RED}))

    // Red dominates. Lighting scales all three channels, but not their
    // order; the default blue-grey (0xabcdef) has blue on top.
    expect(r).toBeGreaterThan(2 * g)
    expect(r).toBeGreaterThan(2 * b)
  })

  test('renders an STL with no colors in the default blue-grey', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    // The same cube, uncolored — the control that shows the sample above
    // is reading the cube's color and not, say, a red UI element.
    const [r, , b] = await dropCubeAndSample(page, binaryStlBytes(CUBE))

    expect(b).toBeGreaterThan(r)
  })
})
