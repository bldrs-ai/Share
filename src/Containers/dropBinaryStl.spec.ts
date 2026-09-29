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
 * default blue-grey, which this assertion rejects; and its channel ratios
 * catch the colors reaching the default (look off) pipeline still
 * linearized, which rendered the red darker and more saturated than
 * authored (green/red 0.06 where the file says 0.26).
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

// After the camera fit a unit cube spans well over half the view; framed
// for the demo model it's a few pixels. A quarter tells the two apart.
const MIN_FRAMED_FRACTION = 0.25
// How close, as a fraction of the orbit distance, the camera must be to
// where its transition ends to count as arrived.
const CAMERA_RESTING_TOLERANCE = 1e-4
// Per-channel difference, 0..255, the cube's centre sample must show from
// the backdrop beside it.
const MIN_CUBE_CONTRAST = 24

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
// Bounds on the rendered green/red ratio of MATERIALISE_RED, around the
// authored 6/23 ≈ 0.26 and well clear of the linearized 0.06.
const MIN_RED_GREEN_RATIO = 0.15
const MAX_RED_GREEN_RATIO = 0.4
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


type Point = {x: number, y: number}

/** Where the loaded model sits on screen, and whether the camera is still. */
type Framing = {
  centre: Point,
  bounds: {left: number, right: number, top: number, bottom: number},
  canvas: {left: number, top: number, width: number, height: number},
  resting: boolean,
}


/**
 * Where the loaded model's bounds land on the page, in CSS pixels, and
 * whether the camera has finished moving, or null while there is no model.
 *
 * @param page Playwright page
 * @return the projected bounds centre and box, the canvas rect, and whether
 *   the camera has settled
 */
function modelFraming(page: Page): Promise<Framing | null> {
  return page.evaluate((RESTING_TOLERANCE) => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const state = (window as any).store?.getState()
    const mesh = state?.model?.mesh
    const context = state?.viewer?.context
    const camera = context?.getCamera?.()
    const controls = context?.getCameraControls?.()
    // The renderer's own canvas, not `querySelector('canvas')`: the ViewCube
    // has a WebGL canvas of its own.
    const canvas = context?.getRenderer?.()?.domElement
    if (!mesh || !camera || !controls || !canvas) {
      return null
    }
    mesh.geometry.computeBoundingBox()
    mesh.updateMatrixWorld(true)
    const rect = canvas.getBoundingClientRect()
    const box = mesh.geometry.boundingBox
    // three's Vector3, without importing three into the page.
    const toPage = (v: any) => {
      const p = v.applyMatrix4(mesh.matrixWorld).project(camera)
      return {
        x: rect.left + (((p.x + 1) / 2) * rect.width),
        y: rect.top + (((1 - p.y) / 2) * rect.height),
      }
    }
    const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => toPage(camera.position.clone().set(
      (i & 1) ? box.max.x : box.min.x,
      (i & 2) ? box.max.y : box.min.y,
      (i & 4) ? box.max.z : box.min.z,
    )))
    return {
      centre: toPage(box.getCenter(camera.position.clone())),
      bounds: {
        left: Math.min(...corners.map((c) => c.x)),
        right: Math.max(...corners.map((c) => c.x)),
        top: Math.min(...corners.map((c) => c.y)),
        bottom: Math.max(...corners.map((c) => c.y)),
      },
      canvas: {left: rect.left, top: rect.top, width: rect.width, height: rect.height},
      // The fit animates (orbit-control.js `fitToSphere(sphere, true)`), and
      // camera-controls' `getPosition()` is where that transition ENDS, so
      // the camera has arrived when it's there. (Not `controls.active`: Share
      // does call `cameraControls.update` every animation frame
      // (context/context.js `render` -> camera/camera.js), but camera-controls'
      // `_hasRested` only flips on a frame that was still moving with every
      // delta under `restThreshold`; a move made without a transition never
      // produces one, so `active` can stay true on a camera that has arrived.)
      resting: camera.position.distanceTo(controls.getPosition(camera.position.clone())) <
        RESTING_TOLERANCE * Math.max(1, controls.distance),
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }, CAMERA_RESTING_TOLERANCE)
}


/**
 * Whether the renderer's canvas is the topmost element at a page point.
 *
 * @param page Playwright page
 * @param point page point in CSS pixels
 * @return true when nothing is drawn over the canvas there
 */
function isRendererCanvasAt(page: Page, point: Point): Promise<boolean> {
  return page.evaluate(({x, y}) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const canvas = (window as any).store?.getState()?.viewer?.context?.getRenderer?.()?.domElement
    return !!canvas && document.elementFromPoint(x, y) === canvas
  }, point)
}


/**
 * A page point beside the model's projected bounds that the canvas itself
 * is under — no UI on top — for a background sample.
 *
 * @param page Playwright page
 * @param framing from modelFraming
 * @return the point, or null if no side has room
 */
function backgroundPoint(page: Page, framing: Framing): Promise<Point | null> {
  return page.evaluate(({bounds, centre, canvas}) => {
    const margin = 24
    const candidates = [
      {x: bounds.right + margin, y: centre.y},
      {x: bounds.left - margin, y: centre.y},
      {x: centre.x, y: bounds.top - margin},
      {x: centre.x, y: bounds.bottom + margin},
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const canvasEl = (window as any).store?.getState()?.viewer?.context?.getRenderer?.()?.domElement
    return candidates.find((p) =>
      p.x > canvas.left && p.x < canvas.left + canvas.width &&
      p.y > canvas.top && p.y < canvas.top + canvas.height &&
      document.elementFromPoint(p.x, p.y) === canvasEl) ?? null
  }, framing)
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
 * Drop a cube and wait for the viewer to show it, framed and still.
 *
 * "Still" is three conditions, because each alone passes too early: the
 * camera fit animates (`fitToSphere(sphere, true)`), so the camera must have
 * reached where that transition ends; the fit may not have STARTED when the triangle count flips, so
 * the cube must fill a fair part of the view (before the fit it is a speck
 * framed for the demo model); and the projected centre and its color must
 * then agree across two consecutive reads.
 *
 * @param page Playwright page
 * @param bytes the STL
 * @return the rendered color at the cube's centre
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
  let previous: {framing: Framing, rgb: number[]} | null = null
  let latest: {framing: Framing, rgb: number[]} | null = null
  await expect.poll(async () => {
    previous = latest
    latest = null
    const framing = await modelFraming(page)
    if (!framing || !framing.resting) {
      return false
    }
    const span = Math.max(framing.bounds.right - framing.bounds.left, framing.bounds.bottom - framing.bounds.top)
    if (span < MIN_FRAMED_FRACTION * Math.min(framing.canvas.width, framing.canvas.height)) {
      return false
    }
    latest = {framing, rgb: await renderedRgbAt(page, framing.centre)}
    return previous !== null &&
      Math.abs(previous.framing.centre.x - framing.centre.x) < 1 &&
      Math.abs(previous.framing.centre.y - framing.centre.y) < 1 &&
      previous.rgb.join() === latest.rgb.join()
  }, {timeout: LOAD_TIMEOUT_MS}).toBe(true)
  const settled = latest as unknown as {framing: Framing, rgb: number[]}
  // The colour checks are about the cube only if the canvas is what's under
  // the centre sample: a UI overlay there would satisfy them by itself.
  expect(await isRendererCanvasAt(page, settled.framing.centre),
    'the renderer canvas is not the topmost element at the cube centre').toBe(true)
  const beside = await backgroundPoint(page, settled.framing)
  expect(beside, 'no uncovered canvas beside the cube to sample').not.toBeNull()
  const background = await renderedRgbAt(page, beside as Point)
  // The centre sample is the cube's only if it differs from what's around
  // the cube; otherwise the caller's color assertions are about the backdrop.
  expect(colorDistance(settled.rgb, background)).toBeGreaterThan(MIN_CUBE_CONTRAST)
  return settled.rgb
}


/**
 * @param a [r, g, b]
 * @param b [r, g, b]
 * @return the largest per-channel difference, 0..255
 */
function colorDistance(a: number[], b: number[]): number {
  return Math.max(...a.map((c, i) => Math.abs(c - b[i])))
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
    // And in the file's proportions. White light scales the channels alike,
    // so their ratios survive it: 6/23 ≈ 0.26 for green over red as authored,
    // but 0.06 if the sRGB values reach the legacy linear output still
    // linearized (loader/stl.js, "Color space").
    expect(g / r).toBeGreaterThan(MIN_RED_GREEN_RATIO)
    expect(g / r).toBeLessThan(MAX_RED_GREEN_RATIO)
  })

  test('renders an STL with no colors in the default blue-grey', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    // The same cube, uncolored — the control that shows the sample above
    // is reading the cube's color and not, say, a red UI element.
    const [r, , b] = await dropCubeAndSample(page, binaryStlBytes(CUBE))

    expect(b).toBeGreaterThan(r)
  })
})
