import {readFile} from 'node:fs/promises'
import {Locator, Page, expect, test} from '@playwright/test'
import {
  EXPORT_TEST_TIMEOUT_MS,
  GLTF_MAGIC,
  PRO_MODULE_PATTERN,
  clickGate,
  disableDracoEncoder,
  dismissLoadSnackbar,
  expectNoHorizontalScroll,
  expectSnackbarOnTop,
  glbJsonChunk,
  loadModelAndWaitForArtifact,
  openExportTab,
  reopenLocalGlb,
  routeProModule,
  selectCompression,
  selectQuality,
  setSubscriptionTier,
  smallestCodecIn,
  toggleMetadata,
  togglePortable,
  waitForCodecSizes,
  waitForCodecSizing,
  waitForEstimate,
  watchProModuleRequests,
} from '../../tests/e2e/export'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {waitForModelReady} from '../../tests/e2e/models'
import {
  auth0Login,
  clearOpfs,
  homepageSetup,
  setIsReturningUser,
  setupAuthenticationIntercepts,
} from '../../tests/e2e/utils'


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
const SPATIAL_CHAIN = ['Bldrs', 'Build', 'Every', 'Thing']
const LEAF_LABEL = 'Together'


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
      // One encode serves both states of the metadata toggle — the payloads
      // pass through untouched and are re-added by arithmetic (#1842) — so
      // what the toggle is worth cannot move with the codec.
      expect(await metadataDelta(compressedBytes)).toBe(uncompressedMetadataBytes)
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
      await page.getByTestId('control-button-open').click()
      // The dialog opens on whichever tab it last showed (Google, for a
      // signed-in user); Browse lives on Local.
      await page.getByRole('tab', {name: 'Local'}).click()
      const chooser = page.waitForEvent('filechooser')
      await page.getByTestId('button_open_file').click()
      await (await chooser).setFiles(path)

      // The upload lands under `/v/new/` and loads from OPFS; the load
      // report's OK is a fresh signal per load (the first one was
      // dismissed above), so it can't be the previous model's.
      await expect(page).toHaveURL(/\/share\/v\/new\/.+\.glb/, {timeout: EXPORT_TEST_TIMEOUT_MS})
      await expect(page.getByTestId('LoadStatusOk'), `${mode} export should load`)
        .toBeVisible({timeout: EXPORT_TEST_TIMEOUT_MS})
      await expect(page.getByText(/Loader error|Unhandled error in parse|DRACOLoader|setMeshoptDecoder/))
        .toHaveCount(0)
      await waitForModelReady(page)
      await dismissLoadSnackbar(page)
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

    await page.getByTestId('control-button-open').click()
    // The dialog opens on whichever tab it last showed (Google, for a
    // signed-in user); Browse lives on Local.
    await page.getByRole('tab', {name: 'Local'}).click()
    const chooser = page.waitForEvent('filechooser')
    await page.getByTestId('button_open_file').click()
    await (await chooser).setFiles(savedPath)

    await expect(page).toHaveURL(/\/share\/v\/new\/.+\.glb/, {timeout: EXPORT_TEST_TIMEOUT_MS})
    await expect(page.getByTestId('LoadStatusOk')).toBeVisible({timeout: EXPORT_TEST_TIMEOUT_MS})
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
    // #1843: the default export IS the batched-native cache artifact, and its
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

    // Pin the codec before reading anything. Since #1850 the panel measures
    // every codec in the background and defaults to the smallest, so the
    // selection is in motion for the first seconds the tab is open. Let the
    // sweep finish, then choose explicitly — an explicit choice is never
    // overridden, so from here the selection is this test's.
    await waitForCodecSizing(page)
    await selectCompression(page, 'none')

    // Off by default: the batched-native shape is the smaller file and the one
    // Share itself reads best.
    const portableToggle = page.getByTestId('export-portable').locator('input')
    await expect(portableToggle).not.toBeChecked()
    const sizeLine = page.getByTestId('export-size')
    await expect(sizeLine).toBeVisible()
    const nativeBytes = await sizeBytes(sizeLine)

    const portableBytes = await togglePortable(page)
    await expect(portableToggle).toBeChecked()
    expect(portableBytes).toBeGreaterThan(0)
    // One node per placement plus its name and TRS is JSON the batched shape
    // does not carry, and no codec compresses the JSON chunk. On `index.ifc`
    // that is a handful of elements; on a 100k-instance model it is ~100 B per
    // instance net of the TRS accessors the rewrite reclaims, which is why the
    // control is opt-in.
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

    // No interaction: opening the tab is the whole trigger.
    const codecSizes = await waitForCodecSizes(page)
    for (const mode of ['none', 'meshopt', 'draco']) {
      expect(codecSizes[mode], `${mode} should have a measured size`).toBeGreaterThan(0)
    }
    // On `index.ifc` Draco wins — 13,084 B, against Meshopt's 21,480 and
    // 17,244 uncompressed, measured through this very spec — but the assertion
    // is about the RULE, not about this fixture: whichever option is smallest
    // is the one selected.
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
    // …and so does the file. This is a CACHE HIT, not a re-encode: measured
    // here, `index.ifc` comes out at 13,084 B under Draco against 21,480 under
    // Meshopt and 17,244 uncompressed, and the winner's cell is precisely the
    // one the sweep keeps (`export/codecSizes.js`). So what it pins is that
    // the panel hands over the bytes it measured — which is the point of
    // keeping the winner — and nothing about re-encoding.
    expect(file.byteLength).toBe(codecSizes[smallest])

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
