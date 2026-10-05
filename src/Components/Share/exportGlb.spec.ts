import {readFile} from 'node:fs/promises'
import {gunzipSync} from 'node:zlib'
import {Locator, Page, expect, test} from '@playwright/test'
import {
  EXPORT_TEST_TIMEOUT_MS,
  GLTF_MAGIC,
  PRO_MODULE_PATTERN,
  clickGate,
  disableDracoEncoder,
  dismissLoadSnackbar,
  doubleClickSelectsAMergedInstance,
  doubleClickSelectsAnElement,
  expectNavTreeFollowsSelection,
  expectNoHorizontalScroll,
  expectProductRowSelected,
  expectSnackbarOnTop,
  glbJsonChunk,
  loadModelAndWaitForArtifact,
  openExportTab,
  openLocalFile,
  reopenLocalGlb,
  selectedInstancesAndAnchors,
  routeProModule,
  selectCompression,
  selectQuality,
  setPortable,
  setSubscriptionTier,
  shiftDoubleClickAnotherInstance,
  shiftDoubleClickAt,
  smallestCodecIn,
  toggleGzip,
  toggleMetadata,
  waitForCodecSizes,
  waitForCodecSizing,
  waitForEstimate,
  watchProModuleRequests,
} from '../../tests/e2e/export'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {captureGlbLogs, resetGlbLogs, waitForGlbLog} from '../../tests/e2e/glbLogs'
import {waitForModelReady} from '../../tests/e2e/models'
import {
  auth0Login,
  clearOpfs,
  homepageSetup,
  setIsReturningUser,
  setupAuthenticationIntercepts,
} from '../../tests/e2e/utils'


/**
 * The selection the store holds: its anchor rows, how many scene instances it
 * narrows to, and the tree root's id. Read from the store because the scene
 * highlight itself is a canvas effect with no DOM to assert on.
 *
 * @param page Playwright page
 * @return the anchors, the instance count and the root's express id
 */
function selectionState(page: Page) {
  return page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const w = window as any
    const state = (w.store ?? w.useStore).getState()
    return {
      anchors: (state.selectedAnchorIds ?? []).map(String),
      instanceCount: (state.selectedInstanceIds ?? []).length,
      rootId: state.rootElement?.expressID as number,
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })
}


/**
 * Open the NavTree, double-click a shell, and expect the product's row to be
 * the selection (#1909). The model's `data-is-selected` count is zero first, so
 * the row can only have come from the pick.
 *
 * @param page Playwright page
 * @param isMerged the model is the merged layout, not a BatchedMesh
 */
async function pickShellAndExpectProductRow(page: Page, isMerged = false) {
  await expect(page.locator('[data-is-selected="true"]')).toHaveCount(0)
  const panel = page.getByTestId('NavTreePanel')
  if (!await panel.isVisible()) {
    await page.getByTestId('control-button-navigation').click()
  }
  await expect(page.locator(`[data-node-label="${SHELLS_PART_NAME}"]`)).toHaveCount(1)
  await (isMerged ? doubleClickSelectsAMergedInstance(page) : doubleClickSelectsAnElement(page, 'any'))
  await expectProductRowSelected(page, SHELLS_PART_NAME)
  await expectNavTreeFollowsSelection(page)
}


/**
 * Load a URL again and wait for it to be served from the artifact cache.
 *
 * @param page Playwright page
 * @param glbLogs the page's captured `[glb]` lines
 * @param opts `url` is what to load: the model's own URL, without the element
 *   path a pick wrote, when omitted. `waitForWrite` is for the first reload
 *   after a cache-miss load, whose artifact is written from an idle callback
 *   well after the model is ready; a load that was itself a hit writes nothing.
 */
async function reloadFromCache(
  page: Page, glbLogs: ReturnType<typeof captureGlbLogs>,
  {url = '', waitForWrite = true}: {url?: string, waitForWrite?: boolean} = {},
) {
  if (waitForWrite) {
    await waitForGlbLog(glbLogs, 'writer: wrote', EXPORT_TEST_TIMEOUT_MS)
  }
  resetGlbLogs(glbLogs)
  const target = url || page.url().replace(/(\.(?:step|stp))(?:\/\d+)+/, '$1')
  // A `goto` to the URL the page is already at is a same-document navigation,
  // not a load.
  if (target === page.url()) {
    await page.reload({waitUntil: 'domcontentloaded'})
  } else {
    await page.goto(target, {waitUntil: 'domcontentloaded'})
  }
  await waitForModelReady(page)
  await waitForGlbLog(glbLogs, 'cache HIT', EXPORT_TEST_TIMEOUT_MS)
  await dismissLoadSnackbar(page)
}


/**
 * After loading a root-only permalink: the product's row is selected, as the
 * pick that wrote the link selected it, and the scene is on all of the
 * product's own geometry (a link cannot say which shell was clicked).
 *
 * @param page Playwright page
 */
async function expectRootSelectedFromPermalink(page: Page) {
  await expectProductRowSelected(page, SHELLS_PART_NAME)
  const restored = await selectionState(page)
  expect(restored.anchors).toEqual([`${restored.rootId}`])
  expect(restored.instanceCount).toBeGreaterThan(1)
  await expect(page).toHaveURL(/\.step\/\d+(\?|#|$)/)
}


/**
 * The anchors of the selection that are no row of the NavTree: a geometry's
 * owner id, which a scene pick leaves as its anchor, is none.
 *
 * @param page Playwright page
 * @return the anchor ids with no tree node
 */
function anchorsNotInTree(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const state = ((window as any).store ?? (window as any).useStore).getState()
    const ids = new Set<string>()
    const walk = (node: any) => {
      ids.add(String(node.expressID))
      for (const child of node.children ?? []) {
        walk(child)
      }
    }
    walk(state.rootElement)
    return (state.selectedAnchorIds ?? []).map(String).filter((id: string) => !ids.has(id))
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })
}


/**
 * How many batched instances are drawn.
 *
 * @param page Playwright page
 * @return the count of visible instances
 */
function visibleBatchedInstances(page: Page): Promise<number> {
  return page.evaluate(() => {
    let visible = 0
    /* eslint-disable @typescript-eslint/no-explicit-any */
    ;((window as any).useStore.getState().viewer.isolator.ifcModel).traverse((obj: any) => {
      if (obj.isBatchedMesh && obj.instanceParents) {
        for (let batchId = 0; batchId < obj.instanceParents.length; batchId++) {
          visible += obj.getVisibleAt(batchId) ? 1 : 0
        }
      }
    })
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return visible
  })
}


/**
 * How many instances the isolator is holding isolated.
 *
 * @param page Playwright page
 * @return the count of isolated instances
 */
function isolatedInstanceCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const isolated = (window as any).useStore.getState().viewer.isolator.isolatedInstanceIds
    return isolated ? isolated.size : 0
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })
}


/**
 * The `BLDRS_*` extension descriptors of a downloaded file.
 *
 * Each one names its payload by bufferView index and says how it is stored
 * (`compressed`). Everything about them except that index must survive a
 * codec untouched — the payloads are re-attached around the transform, not
 * re-encoded (#1842).
 *
 * @param json the parsed JSON chunk of an exported file
 * @return the Bldrs entries of `extensions`, by name
 */
function bldrsDescriptors(
  json: ReturnType<typeof glbJsonChunk>,
): Record<string, {bufferView?: number}> {
  return Object.fromEntries(
    Object.entries(json.extensions ?? {}).filter(([name]) => name.startsWith('BLDRS_')))
}


/**
 * The BIN-chunk bytes the `BLDRS_*` payloads occupy in a downloaded file.
 *
 * This is the half of the metadata toggle's worth that IS identical across
 * codecs: the payloads are encoded once and re-attached around the transform
 * (#1842), so a codec never re-encodes them. The other half — the JSON that
 * REFERENCES them — is not identical, which is why the toggle's total worth
 * is asserted with a bound rather than exactly. See the call site.
 *
 * @param json the parsed JSON chunk of an exported file
 * @param except one extension to leave out of the sum (see {@link WITNESSED_TABLES})
 * @return total byteLength of the views the Bldrs extensions name
 */
function bldrsPayloadBytes(json: ReturnType<typeof glbJsonChunk>, except?: string): number {
  const views = json.bufferViews ?? []
  return Object.entries(bldrsDescriptors(json))
    .filter(([name]) => name !== except)
    .reduce((total, [, extension]) => {
      const view = extension.bufferView === undefined ? null : views[extension.bufferView]
      return total + (view?.byteLength ?? 0)
    }, 0)
}


// The one payload a Draco export legitimately changes: on a COLLAPSED artifact
// (the default, #1871) the codec cannot keep the range canary exact, so the
// export re-writes `BLDRS_instance_tables` with a lossy witness added
// (`export/collapsedWitness.js`). Meshopt is lossless and leaves it alone.
// Everything else stays byte-exact across every codec, which is what the
// assertions below keep pinning; this one is pinned separately, to grow.
const WITNESSED_TABLES = 'BLDRS_instance_tables'


// Bytes per component, and components per element, for the glTF accessor
// types a vertex attribute can use.
const COMPONENT_BYTES: Record<number, number> = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
const TYPE_COMPONENTS: Record<string, number> = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4}


/**
 * Assert every vertex attribute stored in a bufferView sits on one whose
 * stride is its own element size, or that has none — planar, not
 * interleaved. three's `GLTFLoader` reads anything else as an
 * `InterleavedBufferAttribute`, and `InterleavedBuffer.toJSON` serialises the
 * whole backing view once per geometry: the three.js editor's autosave hung
 * on exactly that (glb-export-premium.md §4.3). For a codec-`none` file only;
 * Draco attributes have no view, and Meshopt pads its quantised ones.
 *
 * @param json the parsed JSON chunk of an exported file
 * @return how many attributes were checked, so a caller can assert it was not
 *   none
 */
function expectNoInterleavedVertexViews(json: ReturnType<typeof glbJsonChunk>): number {
  let checked = 0
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      for (const [name, index] of Object.entries(primitive.attributes)) {
        const accessor = json.accessors?.[index]
        if (accessor?.bufferView === undefined) {
          continue
        }
        const elementBytes = COMPONENT_BYTES[accessor.componentType] * TYPE_COMPONENTS[accessor.type]
        const stride = json.bufferViews?.[accessor.bufferView]?.byteStride ?? elementBytes
        expect(stride, `${name} is interleaved`).toBe(elementBytes)
        checked++
      }
    }
  }
  expect(checked, 'a vertex attribute to check').toBeGreaterThan(0)
  return checked
}


/**
 * The raw byte count behind the panel's rounded size label.
 *
 * @param sizeLine the `export-size` locator
 * @return the figure the label rounds
 */
async function sizeBytes(sizeLine: Locator): Promise<number> {
  return Number(await sizeLine.getAttribute('data-bytes'))
}


/**
 * The millimetre figure out of a Quality caption, for comparing two rungs.
 *
 * @param caption e.g. 'parts may move up to 4.7 mm; shading normals rounded'
 * @return the number of millimetres it quotes
 */
function millimetresIn(caption: string | null): number {
  const match = /([\d.]+) mm/.exec(caption ?? '')
  if (match === null) {
    throw new Error(`No millimetre figure in Quality caption: ${caption}`)
  }
  return Number(match[1])
}


/**
 * "Export GLB" in the Save dialog's Export tab (share-140 S2b, #1838;
 * it lived in the Share dialog through S2/#1833).
 *
 * The acceptance test for the whole epic's user-facing claim: a Pro user
 * gets a valid standalone `.glb` out of the artifact Share already cached,
 * and the other two tiers get routed to log in / upgrade instead.
 *
 * What makes this more than the jest coverage: the bytes are real end to
 * end. The IFC is parsed, the writer packs a Bldrs container into OPFS,
 * the store hand-off (`glbArtifact`) enables the button, the premium module
 * is fetched over HTTP and imported from a `blob:` URL, and the file the
 * BROWSER saves is opened here and checked for the `glTF` magic. A unit
 * test can assert every one of those steps and still miss that the blob
 * import, the OPFS read or the download attribute doesn't work in a real
 * page.
 *
 * The setup — flags, the fixture, the artifact wait, and how the premium
 * module reaches the page — lives in `src/tests/e2e/export.ts`.
 *
 * The gated states are here too, because what they must NOT do is only
 * observable in a browser: a DOM-disabled button eats the click, so the help
 * that explains the gate never opens (#1838).
 */
// The two codecs the Export tab offers, and what each does to THIS fixture.
// `index.ifc` is the Bldrs logo — about 12 KB of geometry — and Meshopt's
// per-bufferView extension entries, its fallback buffer and the
// `KHR_mesh_quantization` it brings with it cost more than that much geometry
// saves, so it legitimately grows the file here. The ratio claim belongs to a
// model big enough for a codec to win and is pinned in
// `export/glbCompression.test.js`; what is asserted here for both is the part
// only a browser can show — that the encoder really runs, that the file
// declares its extension, and that the download weighs exactly what the panel
// promised.
const COMPRESSION_CODECS = [
  {mode: 'meshopt', extension: 'EXT_meshopt_compression', isSmallerOnThisFixture: false},
  {mode: 'draco', extension: 'KHR_draco_mesh_compression', isSmallerOnThisFixture: true},
]


// `index.ifc`'s spatial chain, one child per level, and the leaf label its
// building elements share — the same shape `Containers/indexStepLogo.spec.ts`
// walks for the STEP twin of this model.
// A GLB chunk's data is padded to a 4-byte boundary, so two documents whose
// JSON differs by N bytes can differ by as much as N + 3 bytes of file.
const GLB_CHUNK_PADDING_SLACK_BYTES = 3

const SPATIAL_CHAIN = ['Bldrs', 'Build', 'Every', 'Thing']

// One STEP part whose body is 80 unnamed single-triangle shells — an 8 × 5
// grid of quads, each triangle its own `shell_based_surface_model` — written
// for this spec in the shape a mesh-to-STEP export takes.
const SHELLS_FIXTURE = 'src/tests/fixtures/sameIdentityShells.step'
const SHELLS_FIXTURE_ROWS = 80
// An assembly whose ROOT product has geometry of its own (40 shells, with empty
// occurrence paths) beside two child occurrences of one part (1 shell each).
const ASSEMBLY_FIXTURE = 'src/tests/fixtures/assemblyWithRootGeometry.step'
const ASSEMBLY_ROOT_NAME = 'Assembly'
// 40 root-level shells plus 2 occurrences x 1 shell.
const ASSEMBLY_INSTANCES = 42
// Parsing it takes longer than the shared model-ready default allows.
const ASSEMBLY_READY_TIMEOUT_MS = 60_000
// Long enough for a selection's follow-up effects (the URL it wrote, read back)
// to have run, so an assertion after it isn't made before they could undo it.
const SELECTION_SETTLE_MS = 500
const LEAF_LABEL = 'Together'
// The fixture's one PRODUCT, and so the name its tree root and its portable
// node carry.
const SHELLS_PART_NAME = 'Shells'
// Two disconnected top-level parts, 80 unnamed shells each: Conway wraps them
// in a synthetic `Model` node and gives the wrapper and both roots an empty
// occurrence path (#1901, codex on #1908).
const TWO_ROOT_FIXTURE = 'src/tests/fixtures/twoRootShells.step'
const TWO_ROOT_PART_NAMES = ['Shells', 'Plates']


/**
 * How many scene-side highlights the current selection produced.
 *
 * The highlight has no DOM of its own, so this reads the exposed store
 * (`window.store` under the playwright build, `window.useStore` otherwise) for
 * whichever render path is live: the batched model paints in place and records
 * the painted instances in `userData.batchedHighlight.selSet`, while the
 * merged path builds selection subsets on the viewer.
 *
 * @param page Playwright page
 * @return the number of highlighted instances plus selection subsets
 */
async function sceneHighlightCount(page: Page): Promise<number> {
  return await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const w = window as any
    const state = (w.store ?? w.useStore)?.getState?.()
    const viewer = state?.viewer
    const model = viewer?.IFC?.context?.items?.ifcModels?.[0]
    let batched = 0
    const walk = (obj: any) => {
      if (obj.isBatchedMesh) {
        batched += obj.userData?.batchedHighlight?.selSet?.size ?? 0
      }
    }
    if (model?.isBatchedMesh) {
      walk(model)
    } else {
      model?.traverse?.(walk)
    }
    return batched + (viewer?._conwaySelectionSubsets?.length ?? 0)
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })
}


describeMobileAndDesktop('Share 140: Export GLB', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setupAuthenticationIntercepts(page)
    await setIsReturningUser(page.context())
    // Each test gets a fresh context (OPFS is partitioned per context), so
    // this is insurance against a run interrupted mid-write — which is
    // exactly the case an afterEach could not clean up.
    await clearOpfs(page)
  })

  test('a Pro user downloads a valid standalone .glb', async ({page}) => {
    test.setTimeout(EXPORT_TEST_TIMEOUT_MS)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))

    const proModuleRequests = watchProModuleRequests(page)
    await routeProModule(page)

    await loadModelAndWaitForArtifact(page)
    await setSubscriptionTier(page, 'sharePro')
    await auth0Login(page)

    await openExportTab(page)
    // The load's own "Loaded index.ifc" line owns the snackbar until it is
    // dismissed; clearing it makes the assertion below about the EXPORT.
    await dismissLoadSnackbar(page)
    const exportButton = page.getByTestId('export-glb-button')
    await expect(exportButton).toBeEnabled()
    // The batched-native file: the size line's header read (#1841) and the
    // metadata strip are its subject, and Portable (the default since #1831)
    // takes the whole-file path instead.
    await setPortable(page, false)
    await expect(exportButton).toHaveText('Export GLB')

    // Pin the codec before reading anything. Since #1850 the panel measures
    // every codec in the background and defaults to the smallest, so the
    // selection is in motion for the first seconds the tab is open. Let the
    // sweep finish, then choose explicitly — an explicit choice is never
    // overridden, so from here the selection is this test's.
    await waitForCodecSizing(page)
    await selectCompression(page, 'none')

    // What the file will weigh, before anything is downloaded (#1841). The
    // figure is read from the artifact's header; `data-bytes` carries the
    // raw count the label rounds, so the comparison with the saved file
    // below is exact rather than "both say 1.2 MB".
    const sizeLine = page.getByTestId('export-size')
    await expect(sizeLine).toBeVisible()
    const withMetadataBytes = await sizeBytes(sizeLine)
    const withMetadataLabel = (await sizeLine.textContent())?.trim()
    expect(withMetadataBytes).toBeGreaterThan(0)

    // Turning the metadata off has to move the number, which is the half of
    // this feature that was missing: through v0.1 the strip dropped the JSON
    // entries and left their payloads in the BIN chunk.
    const strippedBytes = await toggleMetadata(page)
    expect(strippedBytes).toBeLessThan(withMetadataBytes)
    expect(await toggleMetadata(page)).toBe(withMetadataBytes)
    // The action is the LAST thing in the panel and centred, with the Pro
    // chip riding beside it for a free user (#1838). On the mobile
    // projection that row is the dialog's widest, so this is where a
    // regression would show up as a sideways scroll rather than as a
    // missing element.
    await expectNoHorizontalScroll(page)

    const downloadPromise = page.waitForEvent('download')
    await exportButton.click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toBe('index.glb')
    const savedPath = await download.path()
    const bytes = await readFile(savedPath)
    // The point of the feature: what lands in Downloads is a GLB, not the
    // Bldrs container (which starts with "BLDR" and no third-party viewer
    // can read).
    expect(bytes.subarray(0, GLTF_MAGIC.length).toString('ascii')).toBe(GLTF_MAGIC)
    // The size the panel promised is the size that landed in Downloads.
    expect(bytes.byteLength).toBe(withMetadataBytes)
    // The export really did go through the gated delivery path rather than
    // through anything already in the page bundle.
    expect(proModuleRequests.length).toBeGreaterThan(0)

    // The dialog is still open — the export doesn't close it — so this is
    // the layering case that was broken: the "Exported …" message has to be
    // readable over the dialog, on mobile especially, where the dialog fills
    // the viewport.
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByTestId('snackbar')).toContainText('Exported')
    // …and it reports the same figure the panel showed before the click:
    // `blob.size` there, the header estimate here, one computation
    // (`loader/glbArtifactSize.js`).
    await expect(page.getByTestId('snackbar')).toContainText(`(${withMetadataLabel})`)
    await expectSnackbarOnTop(page)

    // Now the other toggle state, end to end: the stripped file really is
    // the smaller size the panel quoted, which is only true once the strip
    // drops the metadata's bufferViews and their bytes (#1841).
    expect(await toggleMetadata(page)).toBe(strippedBytes)
    const strippedDownloadPromise = page.waitForEvent('download')
    await exportButton.click()
    const strippedDownload = await strippedDownloadPromise
    const strippedFile = await readFile(await strippedDownload.path())

    expect(strippedFile.subarray(0, GLTF_MAGIC.length).toString('ascii')).toBe(GLTF_MAGIC)
    expect(strippedFile.byteLength).toBe(strippedBytes)
  })

  test('a Pro user downloads a Meshopt and a Draco compressed .glb', async ({page}) => {
    test.setTimeout(EXPORT_TEST_TIMEOUT_MS)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))

    await routeProModule(page)
    await loadModelAndWaitForArtifact(page)
    await setSubscriptionTier(page, 'sharePro')
    await auth0Login(page)

    await openExportTab(page)
    await dismissLoadSnackbar(page)
    const exportButton = page.getByTestId('export-glb-button')
    await expect(exportButton).toBeEnabled()
    // Batched-native: the view-count arithmetic below is this artifact's.
    await setPortable(page, false)

    // Pin the codec before reading anything. Since #1850 the panel measures
    // every codec in the background and defaults to the smallest, so the
    // selection is in motion for the first seconds the tab is open. Let the
    // sweep finish, then choose explicitly — an explicit choice is never
    // overridden, so from here the selection is this test's.
    await waitForCodecSizing(page)
    await selectCompression(page, 'none')

    // Uncompressed is the baseline each codec is read against.
    const sizeLine = page.getByTestId('export-size')
    await expect(sizeLine).toBeVisible()
    await expect(page.getByTestId('export-compression')).toContainText('None')
    const uncompressedBytes = await sizeBytes(sizeLine)
    expect(uncompressedBytes).toBeGreaterThan(0)
    const uncompressedMetadataBytes = await metadataDelta(uncompressedBytes)

    // What the payloads themselves weigh, read off the uncompressed download.
    // That figure is the part of the toggle's worth a codec cannot move, and
    // it is asserted exactly against every codec below.
    const uncompressedDownload = page.waitForEvent('download')
    await exportButton.click()
    const uncompressedJson = glbJsonChunk(await readFile(await (await uncompressedDownload).path()))
    const uncompressedPayloadBytes = bldrsPayloadBytes(uncompressedJson)
    const tablesBytes = (json: ReturnType<typeof glbJsonChunk>) =>
      bldrsPayloadBytes(json) - bldrsPayloadBytes(json, WITNESSED_TABLES)
    const uncompressedDescriptors = bldrsDescriptors(uncompressedJson)
    expect(uncompressedPayloadBytes).toBeGreaterThan(0)
    // Guards the per-codec descriptor comparison below against passing
    // vacuously on an empty set.
    expect(Object.keys(uncompressedDescriptors).length).toBeGreaterThan(0)

    for (const codec of COMPRESSION_CODECS) {
      // The encoders are real wasm and only exist in a browser: the unit
      // suite runs them under jsdom with the wasm handed over as bytes, which
      // cannot tell us that the DRACO script tag loads from the page's own
      // `/static/js/draco/` or that Meshopt's module resolves in the bundle.
      const compressedBytes = await selectCompression(page, codec.mode)
      expect(compressedBytes, `${codec.mode} should re-encode the file`).not.toBe(uncompressedBytes)
      if (codec.isSmallerOnThisFixture) {
        expect(compressedBytes, `${codec.mode} should shrink the download`).toBeLessThan(uncompressedBytes)
      }
      const codecMetadataBytes = await metadataDelta(compressedBytes)
      // Three toggle buttons plus their label are the widest control row in
      // the dialog, and on the mobile projection that is where a layout
      // regression shows up as a sideways scroll (#1838).
      await expectNoHorizontalScroll(page)

      const downloadPromise = page.waitForEvent('download')
      await exportButton.click()
      const file = await readFile(await (await downloadPromise).path())

      expect(file.subarray(0, GLTF_MAGIC.length).toString('ascii')).toBe(GLTF_MAGIC)
      // The figure on the line is the file: the panel encoded once, cached
      // the bytes, and the export handed over those very bytes (#1842).
      expect(file.byteLength, `${codec.mode} download should weigh what the panel said`)
        .toBe(compressedBytes)
      const json = glbJsonChunk(file)

      // One encode serves both states of the metadata toggle: the payloads
      // pass through untouched and are re-added by arithmetic (#1842). THIS
      // half is exact — a codec that re-encoded or re-compressed them would
      // move it.
      // The instance tables are the exception for Draco alone, pinned below.
      expect(bldrsPayloadBytes(json, WITNESSED_TABLES), `${codec.mode} must not re-encode the payloads`)
        .toBe(uncompressedPayloadBytes - tablesBytes(uncompressedJson))
      const witnessBytes = tablesBytes(json) - tablesBytes(uncompressedJson)
      if (codec.mode === 'draco') {
        // The default artifact is collapsed, so the Draco file must carry the
        // witness — without it the reader refuses the table and picking is
        // lost on reopen (exportCollapsed.spec.ts performs the pick itself).
        expect(witnessBytes, 'draco adds a lossy witness to the collapsed tables').toBeGreaterThan(0)
      } else {
        expect(witnessBytes, `${codec.mode} leaves the instance tables exact`).toBe(0)
      }

      // Also exact: every descriptor survives the codec unchanged APART from
      // the bufferView index it names. This is what makes the bound below
      // safe to state — without it, a descriptor regression that left the
      // payload bytes alone (reattaching one as `compressed: false`, say,
      // which costs 3 characters and renders that metadata unreadable) could
      // hide inside the slack.
      const codecDescriptors = bldrsDescriptors(json)
      expect(Object.keys(codecDescriptors)).toEqual(Object.keys(uncompressedDescriptors))
      for (const [name, descriptor] of Object.entries(codecDescriptors)) {
        expect({...descriptor, bufferView: undefined}, `${codec.mode} changed ${name}`)
          .toEqual({...uncompressedDescriptors[name], bufferView: undefined})
      }

      // What is left to differ is the INDEX WIDTH, and nothing else: since
      // #1862 merges the geometry views this artifact carries 3 bufferViews
      // uncompressed against 15 Draco'd, so three single-digit indices become
      // double-digit. Measured when this was written: 4,476 B against 4,480 B,
      // every byte of it in `extensions`, with the payloads identical. (Since
      // the collapse went default-on, Draco's payloads differ by the witness
      // alone, which is added to the bound for that reason.)
      // Bound it by the EXACT width difference these descriptors cost rather
      // than by the width they could cost, plus the most two independently
      // 4-byte-padded JSON chunks can differ by.
      // …plus the witness bytes, which are metadata too and so move the
      // toggle's worth by exactly what they weigh.
      const indexWidthDelta = Math.abs(
        JSON.stringify(codecDescriptors).length - JSON.stringify(uncompressedDescriptors).length)
      expect(Math.abs(codecMetadataBytes - uncompressedMetadataBytes),
        `${codec.mode} moved the metadata toggle's worth beyond its index width`)
        .toBeLessThanOrEqual(indexWidthDelta + GLB_CHUNK_PADDING_SLACK_BYTES + witnessBytes)

      expect(json.extensionsUsed).toContain(codec.extension)
      expect(json.extensionsRequired).toContain(codec.extension)
      // …and the Bldrs metadata is still in there, which is the half
      // `@gltf-transform` drops unless it is detached and re-attached around
      // the transform.
      expect(json.extensionsUsed?.some((name) => name.startsWith('BLDRS_'))).toBe(true)
    }
    // Back to None, and the panel is exactly where it started — the cached
    // uncompressed figure, not a third encode.
    expect(await selectCompression(page, 'none')).toBe(uncompressedBytes)

    /**
     * What "Include Bldrs metadata" is worth right now: toggle it off, read
     * the line, toggle it back.
     *
     * @param withMetadataBytes the figure the line carries with it on
     * @return the difference the toggle makes
     */
    async function metadataDelta(withMetadataBytes: number): Promise<number> {
      const stripped = await toggleMetadata(page)
      expect(await toggleMetadata(page)).toBe(withMetadataBytes)
      return withMetadataBytes - stripped
    }
  })

  test('a codec with no encoder in the browser falls back, and says so', async ({page}) => {
    // #1842's fallback, end to end: with no encoder in the browser the
    // estimate and the download are the file exactly as it was, at exactly
    // the size "None" quoted. Only a browser shows that — the encoder is a
    // script tag and a wasm module, and the jest suite reaches the same
    // branch with a stubbed global.
    //
    // That equality is also the case the harness itself used to hang on: a
    // wait keyed on "the figure changed" waits for a change that never comes
    // (`tests/e2e/exportEstimate.ts`), which is why the wait is keyed on the
    // SELECTION the figure describes instead.
    test.setTimeout(EXPORT_TEST_TIMEOUT_MS)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))

    await routeProModule(page)
    // Before the load, not before the click: the stand-in has to be in the
    // page by the time the page's own scripts are.
    await disableDracoEncoder(page)
    await loadModelAndWaitForArtifact(page)
    await setSubscriptionTier(page, 'sharePro')
    await auth0Login(page)

    await openExportTab(page)
    await dismissLoadSnackbar(page)
    const exportButton = page.getByTestId('export-glb-button')
    await expect(exportButton).toBeEnabled()
    // Batched-native, the variant this fallback was written and verified
    // against; the fallback itself is indifferent to the shape.
    await setPortable(page, false)

    // Pin the codec before reading anything. Since #1850 the panel measures
    // every codec in the background and defaults to the smallest, so the
    // selection is in motion for the first seconds the tab is open. Let the
    // sweep finish, then choose explicitly — an explicit choice is never
    // overridden, so from here the selection is this test's.
    await waitForCodecSizing(page)
    await selectCompression(page, 'none')

    const sizeLine = page.getByTestId('export-size')
    await expect(sizeLine).toBeVisible()
    const uncompressedBytes = await sizeBytes(sizeLine)
    expect(uncompressedBytes).toBeGreaterThan(0)

    const fallbackBytes = await selectCompression(page, 'draco')
    expect(fallbackBytes, 'the fallback file is the input file').toBe(uncompressedBytes)
    // "Draco" chosen beside an uncompressed figure reads as a Draco figure,
    // so the panel names what the file actually is.
    await expect(page.getByTestId('export-compression-fallback'))
      .toContainText('Draco isn\'t available in this browser')

    const downloadPromise = page.waitForEvent('download')
    await exportButton.click()
    const file = await readFile(await (await downloadPromise).path())

    expect(file.subarray(0, GLTF_MAGIC.length).toString('ascii')).toBe(GLTF_MAGIC)
    // The panel's promise holds on the fallback path too…
    expect(file.byteLength).toBe(fallbackBytes)
    // …and the file really is the uncompressed one: nothing declares a Draco
    // decoder that the file's geometry would then need and not have.
    expect(glbJsonChunk(file).extensionsRequired ?? []).not.toContain('KHR_draco_mesh_compression')
  })

  test('a compressed export opens back in Share', async ({page}) => {
    // Share is one of the viewers a compressed export has to open in, and it
    // didn't: the GLTFLoader's DRACO and Meshopt decoders were gated on the
    // cache WRITER's feature flags, so a file the user brought failed with
    // "setMeshoptDecoder must be called before loading compressed files" /
    // "No DRACOLoader instance provided" (#1837 smoke). Both codecs' files
    // come back in through the Open dialog's file chooser, the way a user
    // would bring them.
    test.setTimeout(EXPORT_TEST_TIMEOUT_MS * 2)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))

    await routeProModule(page)
    await loadModelAndWaitForArtifact(page)
    await setSubscriptionTier(page, 'sharePro')
    await auth0Login(page)

    await openExportTab(page)
    await dismissLoadSnackbar(page)
    const exportButton = page.getByTestId('export-glb-button')
    await expect(exportButton).toBeEnabled()
    // Batched-native: the decoders are the subject. The default (portable)
    // file's reopen has its own test below.
    await setPortable(page, false)

    const downloads: Array<{mode: string; path: string}> = []
    for (const codec of COMPRESSION_CODECS) {
      await selectCompression(page, codec.mode)
      const downloadPromise = page.waitForEvent('download')
      await exportButton.click()
      // Saved under its own name: Playwright's download temp file has no
      // extension, and the local-file loader needs one to know what it is.
      const path = test.info().outputPath(`index-${codec.mode}.glb`)
      await (await downloadPromise).saveAs(path)
      downloads.push({mode: codec.mode, path})
    }
    await page.keyboard.press('Escape')

    for (const {mode, path} of downloads) {
      // The upload lands under `/v/new/` and loads from OPFS; the load
      // report's OK is a fresh signal per load (the first one was
      // dismissed above), so it can't be the previous model's.
      await test.step(`${mode} export opens`, async () => {
        await reopenLocalGlb(page, path)
        await expect(page.getByText(/Loader error|Unhandled error in parse|DRACOLoader|setMeshoptDecoder/))
          .toHaveCount(0)
        await waitForModelReady(page)
        await dismissLoadSnackbar(page)
      })
    }
  })

  test('an exported .glb reopens as a pickable model, not just geometry', async ({page}) => {
    // #1844: the export IS the batched-native cache artifact, and reopening it
    // rendered the model and even drew the NavTree — the `BLDRS_*` reader
    // plugins park their payloads on `userData` whatever the source — while
    // hover, click and NavTree→scene selection all did nothing. The hydration
    // that rebuilds the decorated BatchedMesh, and the picking restore after
    // it, were gated on `cameFromGlbCache`: on where the BYTES came from, not
    // on what the FILE is. So the one thing this test has to do that
    // "a compressed export opens back in Share" does not is go on to USE the
    // reopened model.
    //
    // Uncompressed on purpose. The codecs are the sibling test's subject, and
    // per-vertex ids do not survive them — a compressed artifact's picking
    // rides on `BLDRS_face_ids` instead, which is a different claim.
    test.setTimeout(EXPORT_TEST_TIMEOUT_MS * 2)

    await routeProModule(page)
    await loadModelAndWaitForArtifact(page)
    await setSubscriptionTier(page, 'sharePro')
    await auth0Login(page)

    await openExportTab(page)
    await dismissLoadSnackbar(page)
    const exportButton = page.getByTestId('export-glb-button')
    await expect(exportButton).toBeEnabled()
    // Batched-native: #1844 is the native file's reopen.
    await setPortable(page, false)
    // Pin the codec before reading anything. Since #1850 the panel measures
    // every codec in the background and defaults to the smallest, so the
    // selection is in motion for the first seconds the tab is open. Let the
    // sweep finish, then choose explicitly — an explicit choice is never
    // overridden, so from here the selection is this test's.
    await waitForCodecSizing(page)
    await selectCompression(page, 'none')
    await expect(page.getByTestId('export-compression')).toContainText('None')

    const downloadPromise = page.waitForEvent('download')
    await exportButton.click()
    // Saved under its own name: Playwright's download temp file has no
    // extension, and the local-file loader needs one to know what it is.
    const savedPath = test.info().outputPath('index-reopened.glb')
    await (await downloadPromise).saveAs(savedPath)
    await page.keyboard.press('Escape')

    await reopenLocalGlb(page, savedPath)
    await waitForModelReady(page)
    await dismissLoadSnackbar(page)

    await page.getByTestId('control-button-navigation').click()
    await expect(page.getByTestId('NavTreePanel')).toBeVisible()
    const node = (label: string) => page.locator(`[data-node-label="${label}"]`)

    // The spatial chain `BLDRS_spatial_tree` carries over from the IFC:
    // project → site → building → storey, one child each, then the leaves.
    // Their presence is the half that already worked before the fix, and it
    // is what makes the selection assertions below about PICKING rather than
    // about the tree having rendered at all.
    for (const name of SPATIAL_CHAIN) {
      await expect(node(name)).toHaveCount(1)
      await node(name).getByTestId('NavTreeNodeToggle').click()
    }
    await expect(node(LEAF_LABEL).first()).toBeVisible()

    await node(LEAF_LABEL).first().getByTestId('NavTreeNodeLabel').click()

    // The row highlights, and only that row.
    await expect(node(LEAF_LABEL).first()).toHaveAttribute('data-is-selected', 'true')
    await expect(page.locator('[data-is-selected="true"]')).toHaveCount(1)
    // The URL addresses the element, so the selection is shareable.
    await expect(page).toHaveURL(/\/share\/v\/new\/[^/]+\.glb(\/\d+)+/)
    // And the SCENE carries the highlight. This is the assertion the bug
    // failed: the tree row lit up, the URL grew its element path, and the
    // model showed nothing, because the hydration that owns the instance
    // tables never ran. The highlight has no DOM, so it is read off the
    // exposed store the way `Containers/sceneHighlightPermalink.spec.ts`
    // reads it — batched selection sets for the hydrated artifact, merged
    // selection subsets for anything that fell back.
    expect(await sceneHighlightCount(page)).toBeGreaterThan(0)
  })

  test('a portable .glb names its elements, and reopens as a pickable model', async ({page}) => {
    // #1843: the native export IS the batched-native cache artifact, and its
    // `EXT_mesh_gpu_instancing` is `extensionsRequired` — so 3dviewer.net
    // refuses the file outright, and the three.js editor shows a flat list of
    // `mesh_N` where Share shows the named IFC hierarchy. Portable rewrites it
    // into a plain scene graph: one named node per element, nested, each
    // placement a child referencing the shared mesh.
    //
    // What only a browser can show, and the jest suite cannot: that the toggle
    // is wired to the estimate and to the export through the same cache, so
    // the figure on the line is the file that lands in Downloads.
    test.setTimeout(EXPORT_TEST_TIMEOUT_MS * 2)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))

    await routeProModule(page)
    await loadModelAndWaitForArtifact(page)
    await setSubscriptionTier(page, 'sharePro')
    await auth0Login(page)

    await openExportTab(page)
    await dismissLoadSnackbar(page)
    const exportButton = page.getByTestId('export-glb-button')
    await expect(exportButton).toBeEnabled()

    // Native first, for the figure to compare against — then Portable. Both
    // stated explicitly rather than read off the default, which is ON since
    // #1831; the default's own download is the next test's subject.
    await setPortable(page, false)
    // Pin the codec before reading anything. Since #1850 the panel measures
    // every codec in the background and defaults to the smallest, so the
    // selection is in motion for the first seconds the tab is open. Let the
    // sweep finish, then choose explicitly — an explicit choice is never
    // overridden, so from here the selection is this test's.
    await waitForCodecSizing(page)
    await selectCompression(page, 'none')

    const portableToggle = page.getByTestId('export-portable').locator('input')
    const sizeLine = page.getByTestId('export-size')
    await expect(sizeLine).toBeVisible()
    const nativeBytes = await sizeBytes(sizeLine)

    await setPortable(page, true)
    const portableBytes = await waitForEstimate(page)
    await expect(portableToggle).toBeChecked()
    expect(portableBytes).toBeGreaterThan(0)
    // One node per placement plus its name and TRS is JSON the batched shape
    // does not carry, and no codec compresses the JSON chunk. On `index.ifc`
    // that is a handful of elements; on a 100k-instance model it is ~100 B per
    // instance net of the TRS accessors the rewrite reclaims — the trade the
    // helper text under the toggle describes.
    expect(portableBytes).not.toBe(nativeBytes)
    // A third control row in the dialog is where a mobile layout regression
    // would show up as a sideways scroll rather than a missing element (#1838).
    await expectNoHorizontalScroll(page)

    const downloadPromise = page.waitForEvent('download')
    await exportButton.click()
    // Saved under its own name: Playwright's download temp file has no
    // extension, and the local-file loader needs one to know what it is.
    const savedPath = test.info().outputPath('index-portable.glb')
    const download = await downloadPromise
    await download.saveAs(savedPath)
    const file = await readFile(savedPath)

    expect(file.subarray(0, GLTF_MAGIC.length).toString('ascii')).toBe(GLTF_MAGIC)
    // The figure on the line is the file: the panel rewrote once, cached the
    // bytes, and the export handed over those very bytes (§4.4).
    expect(file.byteLength).toBe(portableBytes)

    const json = glbJsonChunk(file)
    // The refusal, gone — from BOTH arrays. `extensionsRequired` is the one
    // that made 3dviewer.net reject the file rather than degrade.
    expect(json.extensionsUsed ?? []).not.toContain('EXT_mesh_gpu_instancing')
    expect(json.extensionsRequired ?? []).not.toContain('EXT_mesh_gpu_instancing')
    // …and the names the three.js editor showed as `mesh_N` are the nav tree's.
    // Read off the FILE, not off a three parse: `GLTFLoader` runs every node
    // name through `PropertyBinding.sanitizeNodeName`, which turns spaces into
    // underscores — three's mangling, not the file's.
    const nodeNames = (json.nodes ?? []).map((node) => node.name)
    for (const name of SPATIAL_CHAIN) {
      expect(nodeNames, `portable export should name ${name}`).toContain(name)
    }
    expect(nodeNames).toContain(LEAF_LABEL)
    // Every element node is a real node, and the placements carry the meshes.
    expect((json.nodes ?? []).filter((node) => Number.isInteger(node.mesh)).length).toBeGreaterThan(0)
    // …over vertex data three reads as plain BufferAttributes: no view with a
    // stride wider than one element, which is what made the three.js editor's
    // autosave serialise the whole shared view once per geometry (§4.3).
    expectNoInterleavedVertexViews(json)

    // Back into Share. The nav tree survives — it hydrates from
    // `BLDRS_spatial_tree`, which is indifferent to the node graph — and since
    // #1849 so does picking: `joinPortableNodesToTables` regroups the stamped
    // plain Meshes per table row, so the file rehydrates to the same decorated
    // BatchedMesh the batched-native artifact does. Before it, this reopened
    // as a plain, grey, un-pickable GLB.
    await page.keyboard.press('Escape')
    await reopenLocalGlb(page, savedPath)
    await expect(page.getByText(/Loader error|Unhandled error in parse/)).toHaveCount(0)
    await waitForModelReady(page)
    await dismissLoadSnackbar(page)

    await page.getByTestId('control-button-navigation').click()
    await expect(page.getByTestId('NavTreePanel')).toBeVisible()
    const node = (label: string) => page.locator(`[data-node-label="${label}"]`)
    for (const name of SPATIAL_CHAIN) {
      await expect(node(name)).toHaveCount(1)
      await node(name).getByTestId('NavTreeNodeToggle').click()
    }
    await expect(node(LEAF_LABEL).first()).toBeVisible()

    await node(LEAF_LABEL).first().getByTestId('NavTreeNodeLabel').click()

    // The same three assertions the batched-native reopen makes (#1844): the
    // row selects, the URL addresses the element so the selection is
    // shareable, and — the one that was failing — the SCENE carries the
    // highlight. The highlight has no DOM, so it is read off the exposed
    // store.
    await expect(node(LEAF_LABEL).first()).toHaveAttribute('data-is-selected', 'true')
    await expect(page).toHaveURL(/\/share\/v\/new\/[^/]+\.glb(\/\d+)+/)
    expect(await sceneHighlightCount(page)).toBeGreaterThan(0)
  })

  test('the default export is portable, and reopens with selection working', async ({page}) => {
    // #1831: Portable became the default. This is the user's own action with
    // nothing touched — open the tab, let the panel settle, click Export —
    // then the file back into Share, and a double-click in the scene. Every
    // other export spec pins the toggle to the variant it is about; this one
    // is about the default, so it must not.
    test.setTimeout(EXPORT_TEST_TIMEOUT_MS * 2)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))
    const glbLogs = captureGlbLogs(page)

    await routeProModule(page)
    await loadModelAndWaitForArtifact(page)
    await setSubscriptionTier(page, 'sharePro')
    await auth0Login(page)

    await openExportTab(page)
    await dismissLoadSnackbar(page)
    const exportButton = page.getByTestId('export-glb-button')
    await expect(exportButton).toBeEnabled()

    await expect(page.getByTestId('export-portable').locator('input')).toBeChecked()
    // The trade-off is on screen under the toggle, not only in a tooltip.
    await expect(page.getByTestId('export-portable-help')).toContainText('more glTF viewers can open them')
    await expect(page.getByTestId('export-portable-help')).toBeVisible()
    await expectNoHorizontalScroll(page)

    // The panel settles on its own — the sweep picks the codec — and the line
    // then quotes the file the click produces.
    await waitForCodecSizing(page)
    const quotedBytes = await waitForEstimate(page)

    const downloadPromise = page.waitForEvent('download')
    await exportButton.click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('index.glb')
    const savedPath = test.info().outputPath('index-default.glb')
    await download.saveAs(savedPath)
    const file = await readFile(savedPath)
    expect(file.byteLength).toBe(quotedBytes)

    // Portable: no instancing extension to refuse, and the NavTree's names on
    // the nodes.
    const json = glbJsonChunk(file)
    expect(json.extensionsUsed ?? []).not.toContain('EXT_mesh_gpu_instancing')
    expect(json.extensionsRequired ?? []).not.toContain('EXT_mesh_gpu_instancing')
    const nodeNames = (json.nodes ?? []).map((node) => node.name)
    for (const name of SPATIAL_CHAIN) {
      expect(nodeNames, `the default export should name ${name}`).toContain(name)
    }

    await page.keyboard.press('Escape')
    resetGlbLogs(glbLogs)
    await reopenLocalGlb(page, savedPath)
    await expect(page.getByText(/Loader error|Unhandled error in parse/)).toHaveCount(0)
    await waitForModelReady(page)
    await dismissLoadSnackbar(page)
    // Hydrated from the portable file's stamped nodes back into the decorated
    // BatchedMesh — not the plain-GLTF fallback, which renders and picks
    // nothing.
    await waitForGlbLog(glbLogs, 'hydrated instance-table', EXPORT_TEST_TIMEOUT_MS)

    // The user's action: double-click an element in the scene, and it is
    // selected in the store, the NavTree and the URL.
    await doubleClickSelectsAnElement(page, 'any')
    await expectNavTreeFollowsSelection(page)
  })

  test('the default export of a part made of many shells sits under its product, and reopens with every shell pickable', async ({page}) => {
    // #1900. A STEP part whose body is many unnamed shells — 80 single-
    // triangle `shell_based_surface_model`s under one product, past conway's
    // ceiling for giving unnamed solids identities of their own — collapses
    // to 80 rows that are all ONE element: same parent, same occurrence path.
    // The portable export used to give each row its own node and mesh, which
    // is what made a 28,674-row part crawl in other viewers; it now gives the
    // part one. The user's actions, untouched defaults throughout: open the
    // file, Export, open the download back, double-click a shell.
    test.setTimeout(EXPORT_TEST_TIMEOUT_MS * 2)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))
    const glbLogs = captureGlbLogs(page)

    await routeProModule(page)
    // Any model first, for the flags (`export`, `glbVerbose`) the session
    // keeps across the Open dialog's navigation.
    await loadModelAndWaitForArtifact(page)
    resetGlbLogs(glbLogs)
    await openLocalFile(page, SHELLS_FIXTURE, /\/share\/v\/new\/.+\.step/)
    await waitForModelReady(page)
    await waitForGlbLog(glbLogs, 'writer: wrote', EXPORT_TEST_TIMEOUT_MS)
    await setSubscriptionTier(page, 'sharePro')
    await auth0Login(page)

    await openExportTab(page)
    await dismissLoadSnackbar(page)
    const exportButton = page.getByTestId('export-glb-button')
    await expect(exportButton).toBeEnabled()
    await expect(page.getByTestId('export-portable').locator('input')).toBeChecked()
    await waitForCodecSizing(page)
    const downloadPromise = page.waitForEvent('download')
    await exportButton.click()
    const download = await downloadPromise
    const savedPath = test.info().outputPath('shells-default.glb')
    await download.saveAs(savedPath)

    // One node holds every shell, stamped with the run it covers; no node
    // per shell.
    const json = glbJsonChunk(await readFile(savedPath))
    const stamped = (json.nodes ?? []).filter((node) => Number.isInteger(node.extras?.bldrsTableNode))
    expect(stamped).toHaveLength(1)
    expect(stamped[0].extras?.bldrsRowCount).toBe(SHELLS_FIXTURE_ROWS)

    // #1901: and that node IS the part. The rows are owned by the part's
    // product_definition_shape while the tree's only node is the
    // product_definition, so with an empty occurrence path the two ids never
    // met and the shells hung off a synthetic `Unassigned` node, named by the
    // shape's id, beside an empty node for the part. What a user sees in the
    // three.js editor, 3dviewer.net, or Share's own scene graph.
    const nodeNames = (json.nodes ?? []).map((node) => node.name)
    expect(nodeNames).not.toContain('Unassigned')
    expect(stamped[0].name).toBe(SHELLS_PART_NAME)
    expect(nodeNames.filter((name) => name === SHELLS_PART_NAME)).toHaveLength(1)

    await page.keyboard.press('Escape')
    resetGlbLogs(glbLogs)
    await reopenLocalGlb(page, savedPath)
    await expect(page.getByText(/Loader error|Unhandled error in parse/)).toHaveCount(0)
    await waitForModelReady(page)
    await dismissLoadSnackbar(page)
    // Hydrated back into the decorated BatchedMesh, every shell its own
    // range — not the plain-GLTF fallback, which picks nothing.
    await waitForGlbLog(glbLogs, `${SHELLS_FIXTURE_ROWS} instance(s), 1 collapsed table(s)`, EXPORT_TEST_TIMEOUT_MS)

    // The NavTree names the part, and has no `Unassigned` branch.
    await page.getByTestId('control-button-navigation').click()
    await expect(page.getByTestId('NavTreePanel')).toBeVisible()
    await expect(page.locator(`[data-node-label="${SHELLS_PART_NAME}"]`)).toHaveCount(1)
    await expect(page.locator('[data-node-label="Unassigned"]')).toHaveCount(0)
    await doubleClickSelectsAnElement(page, 'collapsed')
    // #1909: and the pick lands on that row. The shells' owner is the
    // product_definition_shape, the row is the product_definition, and their
    // occurrence path is empty, so nothing joined them and no row lit up.
    await expectProductRowSelected(page, SHELLS_PART_NAME)
    await expectNavTreeFollowsSelection(page)
  })

  test('a shell picked in a freshly opened part highlights its product in the NavTree', async ({page}) => {
    // #1909, before any export is involved: the same part opened straight
    // from the STEP file. The pick's owner is the product_definition_shape,
    // the tree's only row is the product_definition, and the empty
    // occurrence path joins neither, so this was broken on a first load too.
    test.setTimeout(EXPORT_TEST_TIMEOUT_MS * 2)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))
    const glbLogs = captureGlbLogs(page)

    await loadModelAndWaitForArtifact(page)
    resetGlbLogs(glbLogs)
    await openLocalFile(page, SHELLS_FIXTURE, /\/share\/v\/new\/.+\.step/)
    await waitForModelReady(page)
    await dismissLoadSnackbar(page)
    await pickShellAndExpectProductRow(page)

    // And again from the cached artifact (the batched layout, hydrated from
    // its per-batch tables). The model's own URL is reloaded, not the
    // permalink the pick wrote, so the row can only light up through a pick.
    await reloadFromCache(page, glbLogs)
    await pickShellAndExpectProductRow(page)
  })

  test('a shell picked after reopening a part from the merged-layout cache highlights its product', async ({page}) => {
    // #1909 (codex on #1910). `disableGlbBatched` is the merged cache-hit
    // layout, the one a model the batched writer declines still takes: its
    // picking is rebuilt by `Loader#restoreCacheHitPicking`, which reattaches
    // the persisted occurrence table. A part like this one has `[]` for every
    // instance in it, and the reattach skipped those, so the map no longer
    // knew its instances were the root's: the pick highlighted nothing after a
    // reopen, though it had on the first load. Then the link that pick wrote
    // is loaded the same way, to cover its restore on this layout too.
    test.setTimeout(EXPORT_TEST_TIMEOUT_MS * 3)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))
    const glbLogs = captureGlbLogs(page)

    await loadModelAndWaitForArtifact(page, 'disableGlbBatched')
    resetGlbLogs(glbLogs)
    await openLocalFile(page, SHELLS_FIXTURE, /\/share\/v\/new\/.+\.step/)
    await waitForModelReady(page)
    await dismissLoadSnackbar(page)
    // A fresh parse is a BatchedMesh whatever the artifact layout; only the
    // cache-hit model is the merged one.
    await pickShellAndExpectProductRow(page)

    await reloadFromCache(page, glbLogs)
    await pickShellAndExpectProductRow(page, true)

    const permalink = page.url()
    expect(permalink).toMatch(/\.step\/\d+(\?|#|$)/)
    await reloadFromCache(page, glbLogs, {url: permalink, waitForWrite: false})
    await expectRootSelectedFromPermalink(page)
  })

  test('the permalink of a shell picked in a part reopens with its product selected', async ({page}) => {
    // #1909 (codex on #1910): the pick writes the root's id alone as the
    // element path, `part.step/7`. The permalink reader only took paths of
    // two or more segments, so the link restored nothing. Loading it now
    // selects what the pick does: the product's row, and the scene on the
    // product's own geometry.
    test.setTimeout(EXPORT_TEST_TIMEOUT_MS * 2)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))
    const glbLogs = captureGlbLogs(page)

    await loadModelAndWaitForArtifact(page)
    resetGlbLogs(glbLogs)
    await openLocalFile(page, SHELLS_FIXTURE, /\/share\/v\/new\/.+\.step/)
    await waitForModelReady(page)
    await dismissLoadSnackbar(page)
    await pickShellAndExpectProductRow(page)
    // One pick narrows the scene to one shell; the link must restore the
    // whole product, since it cannot say which shell was clicked.
    expect((await selectionState(page)).instanceCount).toBe(1)
    const permalink = page.url()
    expect(permalink).toMatch(/\.step\/\d+(\?|#|$)/)

    await reloadFromCache(page, glbLogs, {url: permalink})
    await expectRootSelectedFromPermalink(page)
  })

  test('shift-picking shells of a one-product part adds and drops each shell, not the product', async ({page}) => {
    // #1909 (codex on #1910). A root-level shell's owner is the
    // product_definition_shape, which is no tree row, so `elementSelection`
    // found nothing for it and a shift-double-click did nothing at all. The
    // row is the product's, shared by every shell: toggling the ROW would drop
    // the product on the second shell. Each shift-pick toggles its own
    // instance, and the product's row stays selected while any is.
    test.setTimeout(EXPORT_TEST_TIMEOUT_MS * 2)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))

    await loadModelAndWaitForArtifact(page)
    await openLocalFile(page, SHELLS_FIXTURE, /\/share\/v\/new\/.+\.step/)
    await waitForModelReady(page)
    await dismissLoadSnackbar(page)
    await pickShellAndExpectProductRow(page)
    const first = await selectedInstancesAndAnchors(page)
    expect(first.instances).toHaveLength(1)

    // A second shell joins. (Only the shells in front at a pixel can be hit,
    // and on the mobile viewport that is two.)
    const second = await shiftDoubleClickAnotherInstance(page, first.instances)
    const both = await selectedInstancesAndAnchors(page)
    expect(both.instances.sort()).toEqual([...first.instances, second.instanceId].sort())
    expect(both.anchors).toEqual(first.anchors)
    await expectProductRowSelected(page, SHELLS_PART_NAME)

    // Shift-picking it again drops just it: not the product, and not both.
    await shiftDoubleClickAt(page, second)
    await expect.poll(async () => (await selectedInstancesAndAnchors(page)).instances).toEqual(first.instances)
    await expectProductRowSelected(page, SHELLS_PART_NAME)
  })

  test('the product row means the whole product; a pick, the shells picked', async ({page}) => {
    // #1909 (codex on #1910), one rule for every way of selecting the root of a
    // one-product part. A scene PICK narrows to the shell(s) clicked. A ROW
    // click means the whole product, as loading its permalink does.
    test.setTimeout(EXPORT_TEST_TIMEOUT_MS * 2)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))

    await loadModelAndWaitForArtifact(page)
    await openLocalFile(page, SHELLS_FIXTURE, /\/share\/v\/new\/.+\.step/)
    await waitForModelReady(page)
    await dismissLoadSnackbar(page)
    await page.getByTestId('control-button-navigation').click()
    const row = page.locator(`[data-node-label="${SHELLS_PART_NAME}"]`)
    await expect(row).toHaveCount(1)
    const everyShell = (await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const w = window as any
      const meshes: any[] = []
      ;((w.store ?? w.useStore).getState().model).traverse((m: any) => {
        if (m.isBatchedMesh && m.instanceOccurrencePaths) {
          meshes.push(m)
        }
      })
      return meshes.flatMap((m) => m.instanceOccurrencePaths
        .map((path: number[] | null, batchId: number) => (path?.length === 0 ? m.instanceOccurrenceIds[batchId] : -1))
        .filter((id: number) => id >= 0))
      /* eslint-enable @typescript-eslint/no-explicit-any */
    })).length
    expect(everyShell).toBeGreaterThan(2)

    // A click on the row: the whole product, and it stays so once the URL the
    // click wrote has been read back.
    await row.click()
    await expectProductRowSelected(page, SHELLS_PART_NAME)
    await expect(page).toHaveURL(/\.step\/\d+(\?|#|$)/)
    await expect.poll(async () => (await selectedInstancesAndAnchors(page)).instances.length).toBe(everyShell)
    await page.waitForTimeout(SELECTION_SETTLE_MS)
    expect((await selectedInstancesAndAnchors(page)).instances).toHaveLength(everyShell)

    // A pick narrows to the shell, and a second joins it.
    await doubleClickSelectsAnElement(page, 'any')
    await expect.poll(async () => (await selectedInstancesAndAnchors(page)).instances.length).toBe(1)
    const picked = (await selectedInstancesAndAnchors(page)).instances
    await shiftDoubleClickAnotherInstance(page, picked)
    await expect.poll(async () => (await selectedInstancesAndAnchors(page)).instances.length).toBe(2)
    // (A shift-click on ANOTHER row keeps both shells: the assembly test below.)

    // A plain click on the row after a pick is the whole product again.
    await row.click()
    await expect.poll(async () => (await selectedInstancesAndAnchors(page)).instances.length).toBe(everyShell)
  })

  test('the root row of an assembly with geometry of its own means the whole assembly', async ({page}) => {
    // #1909 (codex on #1910). The root's own shells have an empty occurrence
    // path, every child occurrence a non-empty one. A row click or a permalink
    // on the root is the whole product: its own shells AND the children,
    // not just the shells the empty path names. A pick still narrows.
    test.setTimeout(EXPORT_TEST_TIMEOUT_MS * 2)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))

    await loadModelAndWaitForArtifact(page)
    await openLocalFile(page, ASSEMBLY_FIXTURE, /\/share\/v\/new\/.+\.step/)
    await waitForModelReady(page, ASSEMBLY_READY_TIMEOUT_MS)
    await dismissLoadSnackbar(page)
    // A pick of one of the root's own shells narrows to it. (Before the NavTree
    // is open: on a phone it covers the part of the canvas the shells are in.)
    await doubleClickSelectsAnElement(page, 'any', 'root')
    await expect.poll(async () => (await selectedInstancesAndAnchors(page)).instances.length).toBe(1)
    const shell = (await selectedInstancesAndAnchors(page)).instances

    // A shift-click on a child's row then adds that occurrence and keeps the shell.
    await page.getByTestId('control-button-navigation').click()
    const root = page.locator(`[data-node-label="${ASSEMBLY_ROOT_NAME}"]`)
    await expect(root).toHaveCount(1)
    const modelUrl = page.url().replace(/(\.step)(?:\/\d+)+/, '$1')
    await page.locator('[data-node-label="Widget"]').first().click({modifiers: ['Shift']})
    await expect.poll(async () => (await selectedInstancesAndAnchors(page)).instances.length).toBeGreaterThan(1)
    const mixed = (await selectedInstancesAndAnchors(page)).instances
    expect(mixed).toEqual(expect.arrayContaining(shell))
    expect(mixed.length).toBeLessThan(ASSEMBLY_INSTANCES)

    // A click on the root row: the shells and the children, still so once the
    // URL it wrote has been read back.
    await root.click()
    await expectProductRowSelected(page, ASSEMBLY_ROOT_NAME)
    await expect.poll(async () => (await selectedInstancesAndAnchors(page)).instances.length)
      .toBe(ASSEMBLY_INSTANCES)
    await page.waitForTimeout(SELECTION_SETTLE_MS)
    expect((await selectedInstancesAndAnchors(page)).instances).toHaveLength(ASSEMBLY_INSTANCES)
    const permalink = page.url()
    expect(permalink).toMatch(/\.step\/\d+(\?|#|$)/)

    // The permalink the click wrote, loaded fresh: the whole assembly as well.
    await page.goto(modelUrl, {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page, ASSEMBLY_READY_TIMEOUT_MS)
    await expect.poll(async () => (await selectedInstancesAndAnchors(page)).instances.length).toBe(0)
    await page.goto(permalink, {waitUntil: 'domcontentloaded'})
    await waitForModelReady(page, ASSEMBLY_READY_TIMEOUT_MS)
    await expectProductRowSelected(page, ASSEMBLY_ROOT_NAME)
    await expect.poll(async () => (await selectedInstancesAndAnchors(page)).instances.length)
      .toBe(ASSEMBLY_INSTANCES)
  })

  test('a root shell shift-picked onto a picked child occurrence keeps that occurrence\'s row', async ({page}) => {
    // #1909 (codex on #1910). A scene pick of a child occurrence is anchored on
    // the geometry's owner (no tree row) and carries its row in the occurrence
    // path. Shift-picking a root-level shell cleared that path while keeping
    // the owner as the anchor: the child stayed lit, with no NavTree row and
    // no place in the permalink. The row has to come across as the anchor.
    test.setTimeout(EXPORT_TEST_TIMEOUT_MS * 2)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))

    await loadModelAndWaitForArtifact(page)
    await openLocalFile(page, ASSEMBLY_FIXTURE, /\/share\/v\/new\/.+\.step/)
    await waitForModelReady(page, ASSEMBLY_READY_TIMEOUT_MS)
    await dismissLoadSnackbar(page)
    await doubleClickSelectsAnElement(page, 'any', 'child')
    await expect.poll(async () => (await selectedInstancesAndAnchors(page)).instances.length).toBe(1)
    const child = (await selectedInstancesAndAnchors(page)).instances

    // Without the row as the anchor, the `#sel:` link written from the two
    // anchors drops the owner (it names rows only) and re-selects just the
    // root: the whole product, so the shell never joins as one more instance.
    await shiftDoubleClickAnotherInstance(page, child, 'root')
    const both = await selectedInstancesAndAnchors(page)
    expect(both.instances).toHaveLength(2)
    expect(both.instances).toEqual(expect.arrayContaining(child))
    // Every anchor is a row of the tree: the child's own, and the root's.
    expect(await anchorsNotInTree(page)).toEqual([])
    expect(both.anchors).toHaveLength(2)
    await page.getByTestId('control-button-navigation').click()
    await expect(page.locator('[data-is-selected="true"]')).toHaveCount(2)
  })

  test('shift-clicking the selected root row drops the product from the selection', async ({page}) => {
    // #1909 (codex on #1910). After a shell pick the root row is an anchor, but
    // the viewer's selected ids hold the shell's owner, not the row: the
    // shift-click read that as "not selected yet" and added it again, so the
    // row could not be toggled off. Same for a row click's whole product.
    test.setTimeout(EXPORT_TEST_TIMEOUT_MS * 2)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))

    await loadModelAndWaitForArtifact(page)
    await openLocalFile(page, SHELLS_FIXTURE, /\/share\/v\/new\/.+\.step/)
    await waitForModelReady(page)
    await dismissLoadSnackbar(page)
    await pickShellAndExpectProductRow(page)
    const row = page.locator(`[data-node-label="${SHELLS_PART_NAME}"]`)

    await row.click({modifiers: ['Shift']})
    await expect.poll(async () => (await selectedInstancesAndAnchors(page)).instances.length).toBe(0)
    expect((await selectedInstancesAndAnchors(page)).anchors).toEqual([])
    await expect(page.locator('[data-is-selected="true"]')).toHaveCount(0)

    // The whole product from a row click goes the same way.
    await row.click()
    await expectProductRowSelected(page, SHELLS_PART_NAME)
    await expect.poll(async () => (await selectedInstancesAndAnchors(page)).instances.length)
      .toBe(SHELLS_FIXTURE_ROWS)
    await row.click({modifiers: ['Shift']})
    await expect.poll(async () => (await selectedInstancesAndAnchors(page)).instances.length).toBe(0)
    await expect(page.locator('[data-is-selected="true"]')).toHaveCount(0)
  })

  test('Hide and Isolate on the root row of an assembly act on the whole assembly', async ({page}) => {
    // #1909 (codex on #1910). The row click lights the root's shells and the
    // children; hide and isolate resolve their targets from the anchors by
    // path, which the root's empty path defeats, so they fell back to the
    // root's owner ids and left the highlighted children alone.
    test.setTimeout(EXPORT_TEST_TIMEOUT_MS * 2)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))

    await loadModelAndWaitForArtifact(page)
    await openLocalFile(page, ASSEMBLY_FIXTURE, /\/share\/v\/new\/.+\.step/)
    await waitForModelReady(page, ASSEMBLY_READY_TIMEOUT_MS)
    await dismissLoadSnackbar(page)
    await page.getByTestId('control-button-navigation').click()
    await page.locator(`[data-node-label="${ASSEMBLY_ROOT_NAME}"]`).click()
    await expect.poll(async () => (await selectedInstancesAndAnchors(page)).instances.length)
      .toBe(ASSEMBLY_INSTANCES)
    // Out of the way of the controls on a phone.
    await page.getByTestId('control-button-navigation').click()
    await expect.poll(() => visibleBatchedInstances(page)).toBe(ASSEMBLY_INSTANCES)

    await page.getByTestId('Hide').click()
    await expect.poll(() => visibleBatchedInstances(page)).toBe(0)
    // Hiding again brings the whole assembly back.
    await page.getByTestId('Hide').click()
    await expect.poll(() => visibleBatchedInstances(page)).toBe(ASSEMBLY_INSTANCES)

    // Isolate shows the same whole assembly: nothing is left out, and the
    // children are not hidden as "other" elements.
    await page.getByTestId('Isolate').click()
    await expect.poll(() => visibleBatchedInstances(page)).toBe(ASSEMBLY_INSTANCES)
    expect(await isolatedInstanceCount(page)).toBe(ASSEMBLY_INSTANCES)
  })

  test('a file of several top-level parts never gives one part the shells of another', async ({page}) => {
    // #1901 follow-up (codex on #1908). Two disconnected parts, each a body of
    // 80 unnamed shells, so every row of both has an EMPTY occurrence path.
    // Joining the rows to the tree on the empty path alone hands the first
    // part all 160 rows and exports the second empty: the file opens and looks
    // right, but names the wrong part. The user's actions are those of the
    // single-part test above.
    test.setTimeout(EXPORT_TEST_TIMEOUT_MS * 2)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))
    const glbLogs = captureGlbLogs(page)

    await routeProModule(page)
    await loadModelAndWaitForArtifact(page)
    resetGlbLogs(glbLogs)
    await openLocalFile(page, TWO_ROOT_FIXTURE, /\/share\/v\/new\/.+\.step/)
    await waitForModelReady(page)
    await waitForGlbLog(glbLogs, 'writer: wrote', EXPORT_TEST_TIMEOUT_MS)
    await setSubscriptionTier(page, 'sharePro')
    await auth0Login(page)

    await openExportTab(page)
    await dismissLoadSnackbar(page)
    const exportButton = page.getByTestId('export-glb-button')
    await expect(exportButton).toBeEnabled()
    await expect(page.getByTestId('export-portable').locator('input')).toBeChecked()
    await waitForCodecSizing(page)
    const downloadPromise = page.waitForEvent('download')
    await exportButton.click()
    const download = await downloadPromise
    const savedPath = test.info().outputPath('two-root-default.glb')
    await download.saveAs(savedPath)

    const json = glbJsonChunk(await readFile(savedPath))
    // The helper's node type predates the portable file's `children`.
    type PortableNode = {name?: string; children?: Array<number>; extras?: {bldrsTableNode?: unknown; bldrsRowCount?: number}}
    const nodes = (json.nodes ?? []) as Array<PortableNode>
    const rowsOf = (node: PortableNode | undefined): number =>
      Number.isInteger(node?.extras?.bldrsTableNode) ? (node?.extras?.bldrsRowCount ?? 1) : 0
    // Every shell of both parts is in the file...
    expect(nodes.reduce((rows, node) => rows + rowsOf(node), 0)).toBe(2 * SHELLS_FIXTURE_ROWS)
    // ...and no part owns more than its own 80: the part a shell is filed
    // under is a claim about it. The bug filed all 160 under the first part.
    const ownedBy = (name: string) => {
      const part = nodes.find((node) => node.name === name)
      expect(part, `the file should name ${name}`).toBeDefined()
      return [part, ...(part?.children ?? []).map((i) => nodes[i])]
        .reduce((rows, node) => rows + rowsOf(node), 0)
    }
    for (const name of TWO_ROOT_PART_NAMES) {
      expect(ownedBy(name), `${name} must not own the other part's shells`)
        .toBeLessThanOrEqual(SHELLS_FIXTURE_ROWS)
    }

    await page.keyboard.press('Escape')
    resetGlbLogs(glbLogs)
    await reopenLocalGlb(page, savedPath)
    await expect(page.getByText(/Loader error|Unhandled error in parse/)).toHaveCount(0)
    await waitForModelReady(page)
    await dismissLoadSnackbar(page)
    await waitForGlbLog(glbLogs, `${2 * SHELLS_FIXTURE_ROWS} instance(s), 1 collapsed table(s)`, EXPORT_TEST_TIMEOUT_MS)
    await doubleClickSelectsAnElement(page, 'collapsed')
  })

  test('a Pro user picks a Quality rung, and the panel says what it costs', async ({page}) => {
    // #1848. The rungs are encoder settings, so what only a browser can show
    // is that they reach the real wasm encoders and change the file the user
    // gets — and that the millimetre caption beside them is computed off THIS
    // model's own bounds rather than being a constant.
    test.setTimeout(EXPORT_TEST_TIMEOUT_MS)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))

    await routeProModule(page)
    await loadModelAndWaitForArtifact(page)
    await setSubscriptionTier(page, 'sharePro')
    await auth0Login(page)

    await openExportTab(page)
    await dismissLoadSnackbar(page)
    const exportButton = page.getByTestId('export-glb-button')
    await expect(exportButton).toBeEnabled()
    // Batched-native, as measured when the rungs were set; the rungs are
    // encoder settings and indifferent to the shape.
    await setPortable(page, false)

    // Pin the codec before reading anything. Since #1850 the panel measures
    // every codec in the background and defaults to the smallest, so the
    // selection is in motion for the first seconds the tab is open. Let the
    // sweep finish, then choose explicitly — an explicit choice is never
    // overridden, so from here the selection is this test's.
    await waitForCodecSizing(page)
    await selectCompression(page, 'none')

    // Balanced by default, and inert until a codec is chosen — there is
    // nothing for a rung to mean while the file is being handed over as it is.
    const qualityControl = page.getByTestId('export-quality')
    await expect(qualityControl).toContainText('Balanced')
    await expect(qualityControl.getByRole('combobox')).toHaveAttribute('aria-disabled', 'true')
    await expect(page.getByTestId('export-quality-caption')).toHaveCount(0)

    const balancedBytes = await selectCompression(page, 'draco')
    await expect(qualityControl.getByRole('combobox')).not.toHaveAttribute('aria-disabled')
    // The caption is a promise about the user's model, in the unit they
    // decide in.
    const balancedCaption = await page.getByTestId('export-quality-caption').textContent()
    expect(balancedCaption).toMatch(/parts may move up to [\d.]+ mm/)

    const smallestBytes = await selectQuality(page, 'smallest')

    // Fewer POSITION bits is a coarser grid, so the figure has to grow — the
    // one thing about the caption that cannot be a constant.
    const smallestCaption = await page.getByTestId('export-quality-caption').textContent()
    expect(smallestCaption).toMatch(/parts may move up to [\d.]+ mm/)
    expect(millimetresIn(smallestCaption)).toBeGreaterThan(millimetresIn(balancedCaption))

    // Reduced is the last rung there is. #1852 shipped two lossy rungs below
    // it and #1854 removed them again — the whole ladder measured −12.4% on
    // Snowdon, where the container and not the geometry is the file — so the
    // panel must not still be offering one.
    await expect(page.getByTestId('export-quality-squashed')).toHaveCount(0)
    await expect(page.getByTestId('export-quality-smooshed')).toHaveCount(0)

    // Two rungs are two different files. On a fixture this small they need
    // not differ in SIZE — the encoder-effort half of a rung is model-shaped
    // (#1848) — so what is asserted is what the panel promises: the figure on
    // the line is the file that lands in Downloads, at the rung now chosen.
    const downloadPromise = page.waitForEvent('download')
    await exportButton.click()
    const file = await readFile(await (await downloadPromise).path())

    expect(file.subarray(0, GLTF_MAGIC.length).toString('ascii')).toBe(GLTF_MAGIC)
    expect(file.byteLength).toBe(smallestBytes)
    expect(glbJsonChunk(file).extensionsRequired).toContain('KHR_draco_mesh_compression')
    // A fourth control row is where a mobile layout regression would show up
    // as a sideways scroll rather than a missing element (#1838), and at
    // 390px "Balanced (medium)" beside "Compression type" is the pair that
    // would push the dialog sideways if the row stopped wrapping.
    await expectNoHorizontalScroll(page)

    // Meshopt has ONE coarser setting and Balanced already spends it, so
    // Reduced re-encodes to Balanced's file. The panel says that rather than
    // leaving a "small" option beside a size line that does not move
    // (`exportQuality.js#isDracoOnlyRung`).
    await selectCompression(page, 'meshopt')
    await expect(page.getByTestId('export-quality-caption'))
      .toContainText('Meshopt has no coarser setting')
    await selectCompression(page, 'draco')

    // Back to Balanced and the panel is exactly where it was — the cached
    // figure for that rung, not a third encode.
    expect(await selectQuality(page, 'balanced')).toBe(balancedBytes)
  })

  test('a Pro user downloads a gzipped .glb.gz, at the size the panel promised', async ({page}) => {
    // #1854. The lossless win that beats the whole quality ladder, because on
    // a real model the container — JSON node graph plus raw float32 instance
    // transforms — is where the bytes are, and no mesh codec touches it.
    //
    // Only a browser can show this end to end: `CompressionStream` is a
    // browser API, the figure on the size line comes from one call to it and
    // the downloaded bytes from another, and the invariant this panel is
    // built on is that those two agree. A unit test can assert both halves
    // and still miss that they disagree in Chromium.
    test.setTimeout(EXPORT_TEST_TIMEOUT_MS)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))

    await routeProModule(page)
    await loadModelAndWaitForArtifact(page)
    await setSubscriptionTier(page, 'sharePro')
    await auth0Login(page)

    await openExportTab(page)
    await dismissLoadSnackbar(page)
    const exportButton = page.getByTestId('export-glb-button')
    await expect(exportButton).toBeEnabled()
    // Batched-native, as #1854 measured it; gzip wraps either shape.
    await setPortable(page, false)

    // No codec, which is the selection the measurement is about: gzip alone,
    // over a file nothing else has squeezed. Pinned after the sweep so the
    // auto-selection cannot move it later (#1850).
    await waitForCodecSizing(page)
    const rawBytes = await selectCompression(page, 'none')
    expect(rawBytes).toBeGreaterThan(0)

    // The toggle says what the user gets before they get it — a `.glb.gz` is
    // not a `.glb` and will not drop into the three.js editor.
    const gzipRow = page.getByTestId('export-gzip-row')
    await expect(gzipRow).toContainText('Compress download')
    await expect(gzipRow).toContainText('.glb.gz')

    const gzippedBytes = await toggleGzip(page)

    // The figure on the line is now the `.glb.gz`, not the `.glb` inside it.
    // `index.ifc` is ~17 KB of mostly JSON, so this is a large margin rather
    // than a knife edge — and it is the same direction the 6× on Snowdon is.
    expect(gzippedBytes).toBeLessThan(rawBytes)

    const downloadPromise = page.waitForEvent('download')
    await exportButton.click()
    const download = await downloadPromise
    const file = await readFile(await download.path())

    // Three separate claims, and each has its own way of being wrong. The
    // NAME must carry both extensions; the LENGTH must be the figure the user
    // read, which is where a non-deterministic gzip would show up; and the
    // CONTENTS must be a gzip member of a real GLB, which is what stops an
    // uncompressed file from being shipped under a `.gz`.
    expect(download.suggestedFilename()).toMatch(/\.glb\.gz$/)
    expect(file.byteLength).toBe(gzippedBytes)

    const inflated = gunzipSync(file)
    expect(inflated.subarray(0, GLTF_MAGIC.length).toString('ascii')).toBe(GLTF_MAGIC)
    expect(inflated.byteLength).toBe(rawBytes)
    // …and the GLB inside is the whole model, not a truncated stream: its
    // JSON chunk parses and still declares the Bldrs payloads the metadata
    // toggle was left on for.
    expect(glbJsonChunk(inflated).extensionsUsed).toContain('BLDRS_spatial_tree')

    await expectSnackbarOnTop(page)
    // A fifth control row, and the one carrying the longest caption in the
    // panel — at 390px "gzip — saves a .glb.gz, reopens in Share" beside the
    // toggle is what would push the dialog sideways if the row stopped
    // wrapping (#1838).
    await expectNoHorizontalScroll(page)
  })

  test('a gzipped export opens back in Share, with its BLDRS data intact', async ({page}) => {
    // The round trip closed (#1831). #1854 shipped the `.glb.gz` and
    // argued the way back was out of scope, so Share could write a file it
    // could not read — and the caption above had to say "unarchive to open".
    // Only a browser can show the whole loop: `CompressionStream` writes the
    // file, `DecompressionStream` opens it, and the two are the browser's,
    // not this repo's.
    //
    // What makes this more than "it loaded" is the last third: the inflated
    // bytes have to be the SAME GLB, so the `BLDRS_*` extensions survive and
    // the model comes back pickable, not just visible.
    test.setTimeout(EXPORT_TEST_TIMEOUT_MS * 2)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))

    await routeProModule(page)
    await loadModelAndWaitForArtifact(page)
    await setSubscriptionTier(page, 'sharePro')
    await auth0Login(page)

    await openExportTab(page)
    await dismissLoadSnackbar(page)
    const exportButton = page.getByTestId('export-glb-button')
    await expect(exportButton).toBeEnabled()
    // Batched-native, as #1831's round trip was verified; gzip wraps either.
    await setPortable(page, false)

    // Uncompressed + gzipped: the codecs are the sibling tests' subject, and
    // per-vertex picking ids do not survive them, which would make the
    // selection assertion below a different claim. Pinned after the sweep so
    // the auto-selection cannot move it later (#1850).
    await waitForCodecSizing(page)
    const rawBytes = await selectCompression(page, 'none')
    const gzippedBytes = await toggleGzip(page)
    expect(gzippedBytes).toBeLessThan(rawBytes)

    const downloadPromise = page.waitForEvent('download')
    await exportButton.click()
    const download = await downloadPromise
    // Saved under its own name: Playwright's download temp file has no
    // extension at all, and the point here is the DOUBLE one — `.glb.gz` is
    // the shape that defeats a last-dot filetype parse.
    expect(download.suggestedFilename()).toMatch(/\.glb\.gz$/)
    const savedPath = test.info().outputPath('index-reopened.glb.gz')
    await download.saveAs(savedPath)
    await page.keyboard.press('Escape')

    // Back in through the Open dialog's file chooser, the way a user would.
    // The URL it lands on ends `.glb`, not `.glb.gz`: the envelope comes off
    // at the upload seam, so what OPFS holds and what the route names is the
    // model (`loader/gzipEnvelope.js`).
    await reopenLocalGlb(page, savedPath)
    await expect(page.getByText(/Loader error|Unhandled error in parse|Could not guess filetype|decompress/))
      .toHaveCount(0)
    await waitForModelReady(page)
    await dismissLoadSnackbar(page)

    await page.getByTestId('control-button-navigation').click()
    await expect(page.getByTestId('NavTreePanel')).toBeVisible()
    const node = (label: string) => page.locator(`[data-node-label="${label}"]`)

    // `BLDRS_spatial_tree` came through the gzip: project → site → building
    // → storey, one child each, then the leaves. A GLB that inflated to
    // anything but the exported bytes would not draw this.
    for (const name of SPATIAL_CHAIN) {
      await expect(node(name)).toHaveCount(1)
      await node(name).getByTestId('NavTreeNodeToggle').click()
    }
    await expect(node(LEAF_LABEL).first()).toBeVisible()

    // And it is a model, not just geometry: the leaf selects, the URL
    // addresses it, and the scene paints the highlight.
    await node(LEAF_LABEL).first().getByTestId('NavTreeNodeLabel').click()
    await expect(node(LEAF_LABEL).first()).toHaveAttribute('data-is-selected', 'true')
    await expect(page).toHaveURL(/\/share\/v\/new\/[^/]+\.glb(\/\d+)+/)
    expect(await sceneHighlightCount(page)).toBeGreaterThan(0)
  })

  test('the panel measures every codec and defaults to the smallest', async ({page}) => {
    // #1850. Which codec wins swings enormously with model shape — Draco by
    // 5× on a geometry-heavy building model, Meshopt by 2.6× on an
    // instance-heavy one, which is exactly what Share's batched writer
    // produces — so a user picking on reputation picks wrong about half the
    // time. The panel measures instead.
    //
    // Only a browser can show this: the figures are three REAL encoder runs
    // against the wasm the page ships, done in the background while the
    // dialog stays usable, and what is asserted at the end is that the
    // download weighs exactly the figure the winning option carried.
    test.setTimeout(EXPORT_TEST_TIMEOUT_MS)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))

    await routeProModule(page)
    await loadModelAndWaitForArtifact(page)
    await setSubscriptionTier(page, 'sharePro')
    await auth0Login(page)

    await openExportTab(page)
    await dismissLoadSnackbar(page)
    const exportButton = page.getByTestId('export-glb-button')
    await expect(exportButton).toBeEnabled()
    // Portable is the default (#1831), so what the sweep measures — and
    // auto-selects on — is the portable file, the one the default click
    // downloads. A sweep of the native file would pick a codec on bytes the
    // user never gets.
    await expect(page.getByTestId('export-portable').locator('input')).toBeChecked()

    // No interaction: opening the tab is the whole trigger.
    const codecSizes = await waitForCodecSizes(page)
    for (const mode of ['none', 'meshopt', 'draco']) {
      expect(codecSizes[mode], `${mode} should have a measured size`).toBeGreaterThan(0)
    }
    // On `index.ifc`'s native file Draco won — 13,084 B, against Meshopt's
    // 21,480 and 17,244 uncompressed, measured through this very spec before
    // Portable became the default (#1831) — but the assertion is about the
    // RULE, not about this fixture or shape: whichever option is smallest is
    // the one selected.
    const smallest = smallestCodecIn(codecSizes)
    await expect(page.getByTestId('export-compression'))
      .toContainText(smallest.charAt(0).toUpperCase() + smallest.slice(1))
    // The dialog took the sweep without seizing up — every control above is
    // still live, and the layout still fits the mobile projection.
    await expect(page.getByTestId('export-include-metadata').locator('input')).toBeEnabled()
    await expectNoHorizontalScroll(page)

    // The size line agrees with the option that won it…
    expect(await waitForEstimate(page)).toBe(codecSizes[smallest])

    const downloadPromise = page.waitForEvent('download')
    await exportButton.click()
    const file = await readFile(await (await downloadPromise).path())

    expect(file.subarray(0, GLTF_MAGIC.length).toString('ascii')).toBe(GLTF_MAGIC)
    // …and so does the file. This is a CACHE HIT, not a re-encode: the
    // winner's cell is precisely the one the sweep keeps
    // (`export/codecSizes.js`). So what it pins is that
    // the panel hands over the bytes it measured — which is the point of
    // keeping the winner — and nothing about re-encoding.
    expect(file.byteLength).toBe(codecSizes[smallest])
    // …and it is the portable file the sweep measured, not the native one.
    expect(glbJsonChunk(file).extensionsUsed ?? []).not.toContain('EXT_mesh_gpu_instancing')

    // The other half, which the download above cannot reach on any fixture:
    // the sweep RELEASED Meshopt when Draco beat it, so picking it now runs
    // the encoder a second time, and the figure it lands on has to be the one
    // the dropdown option was carrying. That equality is what makes releasing
    // safe — the encoders are deterministic, so a dropped cell costs CPU and
    // never a wrong number.
    const meshoptBytes = await selectCompression(page, 'meshopt')
    expect(meshoptBytes).toBe(codecSizes.meshopt)

    // An explicit choice is never overridden, however small a figure the
    // panel is holding for something else.
    const uncompressedBytes = await selectCompression(page, 'none')
    expect(uncompressedBytes).toBe(codecSizes.none)
    await expect(page.getByTestId('export-compression')).toContainText('None')
  })

  test('a signed-out user is told what unlocks Save, and gets no dialog', async ({page}) => {
    test.setTimeout(EXPORT_TEST_TIMEOUT_MS)

    await loadModelAndWaitForArtifact(page)

    // Visible for everyone now, in the gated look.
    await expect(page.getByTestId('gated-save')).toBeVisible()
    await clickGate(page, 'gated-save')

    await expect(page.getByTestId('gated-help')).toContainText('Log in to one of your connectors')
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // And the gate's own action is the way forward.
    await page.getByTestId('gated-help-action').click()
    await expect(page.getByTestId('login-with-github')).toBeVisible()
  })

  test('a signed-in free user is offered the Pro gate, then upgrade', async ({page}) => {
    test.setTimeout(EXPORT_TEST_TIMEOUT_MS)
    // Nothing premium may be requested for a user we already know isn't
    // entitled — the server would refuse, and the UI shouldn't ask.
    const proModuleRequests = watchProModuleRequests(page)
    await page.route(PRO_MODULE_PATTERN, async (route) => {
      await route.fulfill({status: 403, body: 'denied'})
    })

    await loadModelAndWaitForArtifact(page)
    await setSubscriptionTier(page, 'free')
    await auth0Login(page)

    await openExportTab(page)
    // The chip is the affordance that says why the button won't export.
    await expect(page.getByTestId('export-pro-chip')).toBeVisible()

    await clickGate(page, 'gated-export-pro')
    await expect(page.getByTestId('gated-help')).toContainText('Pro subscription')

    await page.getByTestId('gated-help-action').click()

    // `/subscribe/` is an MSW stub in this build and ProfileControl's
    // `useMock` path writes it into the document rather than navigating,
    // so this is the same assertion Profile/Subscription.spec.ts makes.
    await expect(page.getByText('Mock Subscribe Page')).toBeVisible()
    expect(proModuleRequests).toEqual([])
  })
})
