#!/usr/bin/env node
/**
 * Generate the Samples tab's model thumbnails by driving Share's own
 * viewer headlessly.
 *
 * Why the real app instead of a standalone renderer: Share loads IFC,
 * STEP, FBX, PDB, OBJ, STL and GLB through one `Loader.js` stack, so
 * every format is covered for free and the thumbnail shows exactly the
 * materials, lighting and framing a user sees. A separate renderer
 * (conway's CLI, say) only speaks IFC/STEP and would drift from the
 * viewer over time.
 *
 * Framing comes from each sample's `#c:` permalink camera in
 * src/Components/Open/sampleModelRoster.js — the same hash that frames the
 * model when a user opens the sample, so tuning one tunes both.
 *
 * Usage:
 *   node tools/thumbnails/generate.mjs [--only Name,Name] [--size 512]
 *     [--margin 16] [--out public/static/thumbnails] [--port 8129]
 *
 * Requires a playwright-config build (`yarn test-flows-build`): that
 * build exposes `window.store` (so the scene background can be cleared
 * for transparency) and enables `preserveDrawingBuffer`. Models are
 * cached under tools/thumbnails/cache/ and re-used on later runs, so a
 * re-shoot costs no test-models LFS bandwidth.
 */
import {execFile} from 'node:child_process'
import {createHash} from 'node:crypto'
import {existsSync} from 'node:fs'
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {promisify} from 'node:util'
import {chromium} from 'playwright'
import sharp from 'sharp'
import {SAMPLE_MODELS} from '../../src/Components/Open/sampleModelRoster.js'


const execFileAsync = promisify(execFile)

const REPO_ROOT = path.resolve(import.meta.dirname, '../..')
const CACHE_DIR = path.join(REPO_ROOT, 'tools/thumbnails/cache')
const DOCS_DIR = path.join(REPO_ROOT, 'docs')
// MSW's GitHub Contents handler (src/__mocks__/api-handlers-github.ts)
// serves anything under bldrs-ai/test-models from this fixture root. We
// stage every model there — whatever org it really lives in — so one
// URL shape drives the app for all of them. The rendered pixels don't
// care which host the bytes came from.
const FIXTURE_SUBPATH = 'bldrs-ai/test-models/main/thumbs'
const FIXTURE_DIR = path.join(DOCS_DIR, '__test_fixtures__', FIXTURE_SUBPATH)

const MODEL_READY_SELECTOR = '[data-testid="cadview-dropzone"][data-model-ready="true"]'
const LOAD_TIMEOUT_MS = 300000
// Give camera-controls' ease-out and any post-load relayout time to
// settle; the viewer keeps animating briefly after data-model-ready.
const SETTLE_MS = 5000
// Enough distinct hex for a per-model cache filename; the basename is
// appended after it, so this only has to avoid collisions.
const CACHE_KEY_CHARS = 12
// 256MB: Arty_Z7.stp alone is 56MB, and curl's output is buffered.
const MAX_DOWNLOAD_BUFFER = 268435456
// A git-lfs pointer stub starts with a version line well inside this.
const LFS_SNIFF_BYTES = 64
const PORT_PROBE_TIMEOUT_MS = 2000
const SERVER_POLL_MS = 500
const SERVER_START_TIMEOUT_MS = 60000


/** @return {object} parsed argv */
function parseArgs() {
  const args = process.argv.slice(2)
  const opts = {size: 512, margin: 16, out: 'public/static/thumbnails', port: 8129, only: null}

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '')
    opts[key] = args[i + 1]
  }
  opts.size = parseInt(opts.size, 10)
  opts.margin = parseInt(opts.margin, 10)
  opts.port = parseInt(opts.port, 10)
  opts.only = opts.only ? String(opts.only).split(',').map((s) => s.trim()) : null
  return opts
}


/**
 * Split a share path into its GitHub coordinates plus camera hash.
 *
 * @param {string} sharePath e.g. '/share/v/gh/org/repo/ref/a/b.ifc#c:1,2,3,4,5,6'
 * @return {{owner:string, repo:string, ref:string, filePath:string, hash:string}}
 */
function parseSharePath(sharePath) {
  const [withoutHash, hash] = sharePath.split('#')
  const parts = withoutHash.replace('/share/v/gh/', '').split('/')
  const [owner, repo, ref] = parts

  return {
    owner,
    repo,
    ref,
    filePath: parts.slice(3).join('/'),
    hash: hash ? `#${hash}` : '',
  }
}


/**
 * Fetch a model's bytes, preferring the local cache.
 *
 * Large test-models files are Git-LFS-backed: raw.githubusercontent
 * serves a ~130-byte pointer stub for those, so a stub response is
 * re-fetched from the media endpoint that resolves LFS objects.
 *
 * @param {object} coords parseSharePath output
 * @return {Promise<string>} path to the cached file
 */
async function fetchModel(coords) {
  const {owner, repo, ref, filePath} = coords
  const key = createHash('sha1')
    .update(`${owner}/${repo}/${ref}/${filePath}`).digest('hex').slice(0, CACHE_KEY_CHARS)
  const cached = path.join(CACHE_DIR, `${key}-${path.basename(filePath)}`)

  if (existsSync(cached)) {
    return cached
  }

  await mkdir(CACHE_DIR, {recursive: true})

  const encoded = filePath.split('/').map(encodeURIComponent).join('/')
  const raw = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${encoded}`
  const media = `https://media.githubusercontent.com/media/${owner}/${repo}/${ref}/${encoded}`

  // curl rather than fetch(): the sandbox proxy is already configured for
  // it, and -L follows the redirects GitHub uses for both endpoints.
  await execFileAsync('curl', ['-sSL', '-o', cached, raw], {maxBuffer: MAX_DOWNLOAD_BUFFER})

  const head = await readFile(cached, {encoding: 'latin1', flag: 'r'})
    .then((s) => s.slice(0, LFS_SNIFF_BYTES))

  if (head.startsWith('version https://git-lfs')) {
    await execFileAsync('curl', ['-sSL', '-o', cached, media], {maxBuffer: MAX_DOWNLOAD_BUFFER})
  }

  return cached
}


/**
 * Whether something is already accepting connections on a port.
 *
 * @param {number} port
 * @return {Promise<boolean>}
 */
async function isPortListening(port) {
  try {
    const response = await fetch(`http://localhost:${port}/`, {
      signal: AbortSignal.timeout(PORT_PROBE_TIMEOUT_MS),
    })

    return response.ok || response.status > 0
  } catch {
    return false
  }
}


/**
 * Block until the static server answers, so a slow `npx` start can't be
 * mistaken for a dead server by the first page load.
 *
 * @param {number} port
 * @param {number} [timeoutMs]
 * @return {Promise<void>}
 */
async function waitForServer(port, timeoutMs = SERVER_START_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (await isPortListening(port)) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, SERVER_POLL_MS))
  }

  throw new Error(`static server did not come up on port ${port}`)
}


/**
 * Screenshot one model in the running app.
 *
 * @param {object} page Playwright page
 * @param {string} url the app URL to load (includes the camera hash)
 * @param {number} size square canvas edge, in CSS pixels
 * @return {Promise<Buffer>} PNG bytes with a transparent background
 */
async function shoot(page, url, size) {
  await page.goto(url, {waitUntil: 'domcontentloaded'})
  await page.waitForSelector(MODEL_READY_SELECTOR, {timeout: LOAD_TIMEOUT_MS})

  // Hide every control/overlay so the shot is model-only. Done as CSS
  // rather than by unmounting so the viewer's layout (and therefore the
  // camera's aspect ratio) is untouched.
  await page.addStyleTag({content: `
    #viewer-container ~ *, header, footer,
    [data-testid^="control-button"], [data-testid$="-control"],
    .MuiSnackbar-root, .MuiAppBar-root, .MuiDrawer-root { display: none !important; }
    html, body, #root, #viewer-container { background: transparent !important; }
  `})

  // Transparency: the renderer is already created with `alpha: true`, so
  // clearing the scene background is enough — and Postproduction only
  // swaps in its white backdrop when a background is set, so a null one
  // passes through. Then nudge the render loop so the cleared background
  // reaches the drawing buffer before we capture it.
  await page.evaluate(() => {
    const viewer = window.store?.getState?.()?.viewer

    if (!viewer) {
      throw new Error('window.store viewer unavailable — is this a playwright-config build?')
    }
    viewer.context.getScene().background = null
    viewer.context.renderer?.postProduction?.update?.()
  })

  await page.waitForTimeout(SETTLE_MS)

  const canvas = page.locator('#viewer-container canvas').first()

  return canvas.screenshot({omitBackground: true, scale: 'device'})
}


/** Main. */
async function main() {
  const opts = parseArgs()
  const outDir = path.resolve(REPO_ROOT, opts.out)
  const models = opts.only ?
    SAMPLE_MODELS.filter((m) => opts.only.includes(m.name)) :
    SAMPLE_MODELS

  if (models.length === 0) {
    throw new Error(`--only matched no samples: ${opts.only}`)
  }

  await mkdir(outDir, {recursive: true})
  await mkdir(FIXTURE_DIR, {recursive: true})

  // Stage the models where MSW's handler will serve them from.
  const staged = []

  for (const model of models) {
    const coords = parseSharePath(model.path)
    const cachedPath = await fetchModel(coords)
    const fileName = `${model.name}${path.extname(coords.filePath)}`

    await writeFile(path.join(FIXTURE_DIR, fileName), await readFile(cachedPath))
    staged.push({...model, fileName, hash: coords.hash})
    process.stderr.write(`staged ${model.name} (${fileName})\n`)
  }

  // Own the port outright. An earlier version just spawned and slept:
  // when a stale server from a previous run still held the port, this
  // one exited on EADDRINUSE, the batch unknowingly rendered against
  // whatever that other process was serving, and when it later went away
  // every remaining model failed with ERR_CONNECTION_REFUSED. Refusing
  // to start on an occupied port turns that into one clear error.
  if (await isPortListening(opts.port)) {
    throw new Error(
      `port ${opts.port} is already in use — stop that process or pass ` +
        `--port <free port>`)
  }

  const server = execFile('npx', ['http-server', 'docs', '-c-1', '-p', String(opts.port)],
    {cwd: REPO_ROOT})

  server.on('exit', (code) => {
    if (code !== null && code !== 0) {
      process.stderr.write(`static server exited unexpectedly (code ${code})\n`)
    }
  })

  await waitForServer(opts.port)

  // CI pins Chromium at this path; locally Playwright's installed
  // browser is the one that matches the playwright package.
  const ciChromium = '/opt/pw-browsers/chromium'
  const browser = await chromium.launch({
    ...(existsSync(ciChromium) ? {executablePath: ciChromium} : {}),
    args: ['--use-angle=swiftshader'],
  })
  const failures = []

  for (const model of staged) {
    const url =
      `http://localhost:${opts.port}/share/v/gh/${FIXTURE_SUBPATH}/${model.fileName}${model.hash}`

    process.stderr.write(`shooting ${model.name}...\n`)

    // A context per model, not one shared page: the viewer's wasm heap
    // and OPFS state persist across in-page navigations, and after a
    // couple of large models (SEESTRASSE alone is 25MB) later loads
    // never reached data-model-ready. A fresh context costs a few
    // seconds of app boot in a batch job, and makes each shot
    // independent of whatever ran before it.
    const context = await browser.newContext({
      viewport: {width: opts.size, height: opts.size},
      deviceScaleFactor: 2,
    })

    // Skip the first-run splash so the viewer is the whole page.
    await context.addCookies([
      {name: 'isFirstTime', value: '1', domain: 'localhost', path: '/'},
    ])

    const page = await context.newPage()

    try {
      const png = await shoot(page, url, opts.size)
      const outPath = path.join(outDir, `${model.name}.webp`)

      // Normalize how much of the frame the model fills. The viewer's
      // auto-frame (and each permalink camera) leaves a different amount
      // of empty space, which reads as a jumbled gallery at card size.
      // Trimming the transparent border and re-padding to a fixed margin
      // makes every card carry the same visual weight, and leaves the
      // camera hash responsible only for the viewing ANGLE — the part
      // that wants human judgement.
      const inner = opts.size - (2 * opts.margin)
      const transparent = {r: 0, g: 0, b: 0, alpha: 0}

      const trimmed = await sharp(png).trim().toBuffer()

      await sharp(trimmed)
        .resize(inner, inner, {fit: 'contain', background: transparent})
        .extend({
          top: opts.margin,
          bottom: opts.margin,
          left: opts.margin,
          right: opts.margin,
          background: transparent,
        })
        .webp({quality: 82, alphaQuality: 90}).toFile(outPath)
      process.stderr.write(`  wrote ${path.relative(REPO_ROOT, outPath)}\n`)
    } catch (err) {
      failures.push(`${model.name}: ${String(err).split('\n')[0]}`)
      process.stderr.write(`  FAILED ${model.name}: ${String(err).split('\n')[0]}\n`)
    } finally {
      await context.close()
    }
  }

  await browser.close()
  server.kill()

  // The staging copies are build output, not sources — leave docs/ clean.
  for (const model of staged) {
    await rm(path.join(FIXTURE_DIR, model.fileName), {force: true})
  }

  if (failures.length > 0) {
    process.stderr.write(`\n${failures.length} failure(s):\n${failures.join('\n')}\n`)
    process.exitCode = 1
  }
}

main()
