import {expect, test} from '@playwright/test'
import {
  dismissLoadSnackbar,
  openExportTab,
  selectCompression,
  setPortable,
  waitForCodecSizing,
} from '../../tests/e2e/export'
import {resetGlbLogs, waitForGlbLog} from '../../tests/e2e/glbLogs'
import {glbFramingProblems} from '../../tests/e2e/live/glbBytes'
import {
  LIVE_TEST_TIMEOUT_MS,
  clickExportAndDownload,
  loginWithPassword,
  openLiveModel,
  opfsContainers,
  requireLive,
  setReturningVisitor,
  waitForArtifactWritten,
  withoutCompressionStream,
  wrappedWriterWorkers,
  skipAllWithoutTarget,
} from '../../tests/e2e/live/liveSession'


/**
 * Live smoke, §8 step 9: a browser with no `CompressionStream` (Safari
 * before 16.4). The cache must fall back to the uncompressed v2 container
 * and still hit on reload; the Export tab must hide "Compress download"; a
 * plain `.glb` export must still work.
 *
 * The control — the same load WITH CompressionStream writing v3 — is in
 * exportAnonymous.live.spec.ts, so "v2" here can only be the fallback.
 */
test.describe('Live smoke: no CompressionStream (step 9)', () => {
  skipAllWithoutTarget()

  test('the cache falls back to the v2 container and still hits on reload', async ({page, context}, testInfo) => {
    test.setTimeout(LIVE_TEST_TIMEOUT_MS)
    const {target} = requireLive(testInfo)
    await setReturningVisitor(context, target)
    await withoutCompressionStream(context)

    const glbLogs = await openLiveModel(page)
    await waitForArtifactWritten(page, glbLogs)
    expect(await page.evaluate(() => typeof CompressionStream)).toBe('undefined')
    // The writer's worker really was started through the shim; without
    // this, a v3 artifact could be blamed on the fallback, or a v2 on luck.
    expect(await wrappedWriterWorkers(page)).toBeGreaterThan(0)

    const containers = await opfsContainers(page)
    expect(containers.length).toBeGreaterThan(0)
    expect(containers.map((c) => c.version)).toEqual(containers.map(() => 2))

    resetGlbLogs(glbLogs)
    await page.reload({waitUntil: 'domcontentloaded'})
    await waitForGlbLog(glbLogs, 'cache HIT', LIVE_TEST_TIMEOUT_MS)
  })

  test('a Pro user still exports a plain .glb, with no Compress download row', async ({page, context}, testInfo) => {
    test.setTimeout(LIVE_TEST_TIMEOUT_MS)
    const {target, account} = requireLive(testInfo, {role: 'pro'})
    await setReturningVisitor(context, target)
    await withoutCompressionStream(context)
    await loginWithPassword(context, target, account as {email: string, password: string})

    const glbLogs = await openLiveModel(page, {isSignedIn: true})
    await waitForArtifactWritten(page, glbLogs)
    expect(await wrappedWriterWorkers(page)).toBeGreaterThan(0)

    await openExportTab(page)
    await dismissLoadSnackbar(page)
    await expect(page.getByTestId('export-glb-button')).toBeEnabled()
    // Hidden outright, not disabled: there is no gzip to offer.
    await expect(page.getByTestId('export-gzip-row')).toHaveCount(0)
    await setPortable(page, false)
    await waitForCodecSizing(page)
    const expected = await selectCompression(page, 'none')

    const {bytes, name} = await clickExportAndDownload(page)
    expect(name).toBe('index.glb')
    expect(glbFramingProblems(bytes)).toEqual([])
    expect(bytes.byteLength).toBe(expected)
  })
})
