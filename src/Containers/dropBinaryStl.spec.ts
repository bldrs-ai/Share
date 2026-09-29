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
 */

const TEST_TIMEOUT_MS = 60_000
const LOAD_TIMEOUT_MS = 30_000

const STL_HEADER_BYTES = 80
const STL_COUNT_BYTES = 4
const STL_TRIANGLE_BYTES = 50
const FLOAT_BYTES = 4

// A unit tetrahedron, one outward-facing triangle per row.
const TETRAHEDRON: Array<Array<[number, number, number]>> = [
  [[0, 0, 0], [0, 1, 0], [1, 0, 0]],
  [[0, 0, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
]


/**
 * A binary STL whose header is 80 zero bytes, as the reported file's is.
 * Normals are left zero; STLLoader reads them but nothing here depends on
 * them.
 *
 * @return the whole file, as a plain array so it crosses `page.evaluate`
 */
function binaryStlBytes(): number[] {
  const bytes = new Uint8Array(
    STL_HEADER_BYTES + STL_COUNT_BYTES + (TETRAHEDRON.length * STL_TRIANGLE_BYTES))
  const view = new DataView(bytes.buffer)
  view.setUint32(STL_HEADER_BYTES, TETRAHEDRON.length, true)
  TETRAHEDRON.forEach((triangle, i) => {
    const start = STL_HEADER_BYTES + STL_COUNT_BYTES + (i * STL_TRIANGLE_BYTES)
    // The normal (3 floats, left zero), then the three vertices.
    const floats = [0, 0, 0, ...triangle.flat()]
    floats.forEach((f, j) => view.setFloat32(start + (j * FLOAT_BYTES), f, true))
  })
  return Array.from(bytes)
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
})
