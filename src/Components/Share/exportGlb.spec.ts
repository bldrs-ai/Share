import {readFile} from 'node:fs/promises'
import {expect, test} from '@playwright/test'
import {
  EXPORT_TEST_TIMEOUT_MS,
  GLTF_MAGIC,
  PRO_MODULE_PATTERN,
  clickGate,
  dismissLoadSnackbar,
  expectNoHorizontalScroll,
  expectSnackbarOnTop,
  loadModelAndWaitForArtifact,
  openExportTab,
  routeProModule,
  setSubscriptionTier,
  watchProModuleRequests,
} from '../../tests/e2e/export'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {
  auth0Login,
  clearOpfs,
  homepageSetup,
  setIsReturningUser,
  setupAuthenticationIntercepts,
} from '../../tests/e2e/utils'


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
    expect(bytes.byteLength).toBeGreaterThan(0)
    // The export really did go through the gated delivery path rather than
    // through anything already in the page bundle.
    expect(proModuleRequests.length).toBeGreaterThan(0)

    // The dialog is still open — the export doesn't close it — so this is
    // the layering case that was broken: the "Exported …" message has to be
    // readable over the dialog, on mobile especially, where the dialog fills
    // the viewport.
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByTestId('snackbar')).toContainText('Exported')
    await expectSnackbarOnTop(page)
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
