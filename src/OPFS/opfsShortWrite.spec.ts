import {createHash} from 'crypto'
import {readFileSync} from 'fs'
import {expect, Page, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {waitForModelReady} from '../tests/e2e/models'
import {homepageSetup, setIsReturningUser} from '../tests/e2e/utils'


/**
 * OPFS stores a model byte for byte, or not at all (#2042).
 *
 * Chromium's `FileSystemSyncAccessHandle.write()` can fail without throwing.
 * Measured in an incognito profile past ~1 GB of OPFS data, it returned
 * 4294967288 (-8 read as unsigned) and landed only part of the chunk. The
 * worker ignored that count, so an 860.7 MB model was cached as 807-840 MB
 * under its final name and handed to Conway as whole, which drew a wrong
 * model with no error.
 *
 * A gigabyte is too much to stage in CI, so the failing tests fake the same
 * handle for the real worker ({@link failWritesPastLimit}): every write past
 * {@link WRITE_LIMIT} bytes lands its leading part and returns that count.
 * The worker code under test is the real build.
 *
 * The first test checks the other side: with nothing patched, the cached
 * copy is the served file, size and SHA-256 both.
 */
const HOSTED_FILE = 'public/index.ifc'
const HOSTED_PATH = '/share/v/p/index.ifc'
// The hosted model is cached as `index.ifc.<key>` (OPFS.worker.js
// downloadModelToOPFS), so match on the stem.
const HOSTED_ENTRY = /^index\.ifc\./
// index.ifc is 18 KB, so this limit cuts its first chunk short.
const WRITE_LIMIT = 4096
const BOGUS_WRITE_RESULT = 4294967288
const UPLOAD_URL = /\/share\/v\/local-only\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.ifc$/
// The drop tests load twice (the home model, then the drop).
const TWO_LOADS_TIMEOUT_MS = 90_000


interface OpfsFile {
  path: string
  size: number
  sha256: string
}


/** @return Every OPFS file of this origin, with its size and SHA-256. */
async function listOpfs(page: Page): Promise<OpfsFile[]> {
  return await page.evaluate(async () => {
    const files: {path: string, size: number, sha256: string}[] = []
    // `as any`: lib.dom.d.ts in our TS version doesn't type the async
    // iterator on FileSystemDirectoryHandle (see clearOpfs in e2e/utils.ts).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const walk = async (dir: any, prefix: string) => {
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind === 'directory') {
          await walk(handle, `${prefix}${name}/`)
          continue
        }
        const file = await handle.getFile()
        const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
        const hex = 16
        const sha256 = [...new Uint8Array(digest)].map((b) => b.toString(hex).padStart(2, '0')).join('')
        files.push({path: prefix + name, size: file.size, sha256})
      }
    }
    await walk(await navigator.storage.getDirectory(), '')
    return files
  })
}


/**
 * @return The load report's lines (`window.store`, which the playwright
 *   build exposes; see BaseRoutes.jsx).
 */
async function loadReportLines(page: Page): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await page.evaluate(() => (window as any).store.getState().loadReportLines ?? [])
}


/** @return The file's last path segment. */
function baseName(file: OpfsFile): string {
  return file.path.split('/').pop() ?? ''
}


/**
 * Make every OPFS worker's sync access handle behave like the one #2042
 * measured: a write past {@link WRITE_LIMIT} bytes lands its leading part
 * and returns {@link BOGUS_WRITE_RESULT}.
 *
 * Done where the page constructs the worker, not on the network. A route
 * on `OPFS.worker.js` missed some loads: the worker script did not always
 * come through the route (seen locally as a hosted load that stored the
 * file normally). Here each OPFS worker is created from a blob module that
 * statically imports the real worker and then patches the handle. A static
 * import evaluates first, and the worker takes no message until the whole
 * module graph has run, so every write the worker makes is patched.
 *
 * @param page Before its navigation
 */
async function failWritesPastLimit(page: Page) {
  await page.addInitScript(({limit, bogus}) => {
    const patch = `
const proto = self.FileSystemSyncAccessHandle.prototype
const write = proto.write
proto.write = function(buffer, options = {}) {
  const bytes = ArrayBuffer.isView(buffer) ?
    new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength) :
    new Uint8Array(buffer)
  const at = options.at ?? 0
  if (at + bytes.byteLength <= ${limit}) {
    return write.call(this, buffer, options)
  }
  if (at < ${limit}) {
    write.call(this, bytes.subarray(0, ${limit} - at), {at})
  }
  return ${bogus}
}`
    const NativeWorker = window.Worker
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const PatchedWorker: any = function(url: string | URL, options?: WorkerOptions) {
      const href = new URL(String(url), location.href).href
      if (!/\/OPFS\.worker(\.classic)?\.js/.test(href)) {
        return new NativeWorker(url, options)
      }
      const source = `import ${JSON.stringify(href)}\n${patch}\n`
      const blobUrl = URL.createObjectURL(new Blob([source], {type: 'text/javascript'}))
      return new NativeWorker(blobUrl, {...options, type: 'module'})
    }
    PatchedWorker.prototype = NativeWorker.prototype
    window.Worker = PatchedWorker
  }, {limit: WRITE_LIMIT, bogus: BOGUS_WRITE_RESULT})
}


/**
 * Drop `HOSTED_FILE` on the viewer the way a user's drag would.
 *
 * @param page
 */
async function dropFile(page: Page) {
  const bytes = [...readFileSync(HOSTED_FILE)]
  await page.evaluate((bytesArg) => {
    const dropzone = document.querySelector('[data-testid="cadview-dropzone"]')
    if (!dropzone) {
      throw new Error('Drop target not found')
    }
    const dt = new DataTransfer()
    dt.items.add(new File([new Uint8Array(bytesArg)], 'dropped.ifc'))
    dropzone.dispatchEvent(new DragEvent('drop', {bubbles: true, cancelable: true, dataTransfer: dt}))
  }, bytes)
}


describeMobileAndDesktop('OPFS stores a model whole or not at all (#2042)', () => {
  const hosted = new Uint8Array(readFileSync(HOSTED_FILE))
  const hostedSha256 = createHash('sha256').update(hosted).digest('hex')

  test.beforeEach(async ({page, context}) => {
    await homepageSetup(page)
    await setIsReturningUser(context)
  })

  test('a hosted model is cached byte for byte', async ({page}) => {
    await page.goto(HOSTED_PATH, {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page)

    const cached = (await listOpfs(page)).filter((f) => HOSTED_ENTRY.test(baseName(f)))
    expect(cached).toHaveLength(1)
    expect(cached[0].size).toBe(hosted.length)
    expect(cached[0].sha256).toBe(hostedSha256)
  })

  test('a hosted model whose writes come up short still loads, and nothing short is cached', async ({page}) => {
    await failWritesPastLimit(page)
    await page.goto(HOSTED_PATH, {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page)
    // The worker reported the short write, so the Loader fell back to its
    // direct fetch, whose stage only that path reports. Before #2042 the
    // short write went unreported, and the 4 KB prefix read back from OPFS
    // was what got parsed.
    expect(await loadReportLines(page)).toContainEqual(expect.stringMatching(/^Downloading model data: /))

    // Before #2042 a 4096-byte `index.ifc.<key>` stayed here, and the next
    // load took it for a cache hit.
    const opfs = await listOpfs(page)
    expect(opfs.filter((f) => HOSTED_ENTRY.test(baseName(f)))).toEqual([])
    expect(opfs.filter((f) => f.size === WRITE_LIMIT)).toEqual([])
  })

  test('a dropped model whose writes come up short opens from memory', async ({page}) => {
    test.setTimeout(TWO_LOADS_TIMEOUT_MS)
    await failWritesPastLimit(page)
    await page.goto(HOSTED_PATH, {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page)

    await dropFile(page)

    // The in-memory path's URL and title, as in noOpfsUpload.spec.ts. Before
    // #2042 the drop opened the 4 KB stored prefix, which failed to parse.
    await expect(page).toHaveURL(UPLOAD_URL)
    await waitForModelReady(page)
    await expect(page).toHaveTitle(/^Local-only: /)
    await expect(page).toHaveURL(UPLOAD_URL)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect((await listOpfs(page)).filter((f) => f.size === WRITE_LIMIT)).toEqual([])
  })
})
