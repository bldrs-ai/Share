import {Page, expect, test} from '@playwright/test'
import {waitForModelReady} from './models'
import {homepageSetup, setIsReturningUser} from './utils'


/**
 * Residency slider (slice B2 of #1613): the glasses control dials how much
 * of the batched model is resident — 100% shows everything, 0% evicts
 * everything, and the priority metric orders what survives in between.
 *
 * Asserted against the real scene: instance visibility is read straight
 * off the model's BatchedMesh batches (`getVisibleAt`), the same state the
 * renderer draws — DOM-side assertions alone can't prove eviction.
 */
const {describe} = test

type StoreWindow = Window & {store?: {getState: () => {model?: unknown}}}

// The demand load + three renders push past the default 30s budget.
const TEST_TIMEOUT_MS = 60_000
// A mid-track click lands near 50%; allow pixel-rounding slack.
const MID_VALUE_MIN = 30
const MID_VALUE_MAX = 70


/**
 * Count visible vs total batched instances on the loaded model.
 *
 * @param page Playwright page
 * @return visible/total instance counts
 */
function batchedVisibility(page: Page): Promise<{visible: number, total: number}> {
  return page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const model = (window as unknown as StoreWindow).store?.getState().model as any
    const meshes: any[] = []
    if (model?.isBatchedMesh) {
      meshes.push(model)
    }
    (model?.children ?? []).forEach((child: any) => {
      if (child?.isBatchedMesh) {
        meshes.push(child)
      }
    })
    let visible = 0
    let total = 0
    for (const mesh of meshes) {
      const count = mesh.instanceParents?.length ?? 0
      for (let index = 0; index < count; index++) {
        total++
        if (mesh.getVisibleAt(index)) {
          visible++
        }
      }
    }
    return {visible, total}
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })
}


describe('Residency slider', () => {
  test('dials batched residency 100% → 0% → 100% and survives metric switches', async ({page}) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    page.on('pageerror', (err) => console.warn(`[pageerror] ${err.message}`))

    await homepageSetup(page)
    await setIsReturningUser(page.context())

    // index.ifc loads through the demand path (demandGeometry default-on),
    // so the model is the incrementally assembled BatchedMesh group.
    await page.goto('/share/v/p/index.ifc')
    await waitForModelReady(page)

    // Everything starts resident.
    const initial = await batchedVisibility(page)
    expect(initial.total).toBeGreaterThan(0)
    expect(initial.visible).toBe(initial.total)

    // The glasses control opens the residency popover.
    await page.getByTestId('control-button-residency').click()
    const slider = page.getByTestId('residency-slider').getByRole('slider')
    await expect(slider).toBeVisible()
    // Let the Popover's grow transition settle — a key press mid-
    // transition can land before MUI wires the slider's keyboard
    // handling, silently dropping the Home/End.
    await expect(slider).toHaveAttribute('aria-valuenow', '100')

    // Slider to 0%: everything evicts (still model-ready, no errors).
    await slider.press('Home')
    await expect(slider).toHaveAttribute('aria-valuenow', '0')
    await expect.poll(async () => (await batchedVisibility(page)).visible).toBe(0)

    // Back to 100%: everything restores.
    await slider.press('End')
    await expect(slider).toHaveAttribute('aria-valuenow', '100')
    await expect.poll(async () => (await batchedVisibility(page)).visible).toBe(initial.total)

    // Metric switches re-apply cleanly at partial residency: click the
    // middle of the track (per-key stepping is too slow for a flow test).
    const track = await page.getByTestId('residency-slider').boundingBox()
    if (track === null) {
      throw new Error('residency slider track not laid out')
    }
    await page.mouse.click(track.x + (track.width / 2), track.y + (track.height / 2))
    const midValue = Number(await slider.getAttribute('aria-valuenow'))
    expect(midValue).toBeGreaterThan(MID_VALUE_MIN)
    expect(midValue).toBeLessThan(MID_VALUE_MAX)
    const atHalf = await batchedVisibility(page)
    expect(atHalf.visible).toBeGreaterThan(0)
    expect(atHalf.visible).toBeLessThan(atHalf.total)

    await page.getByLabel('Memory budget').check()
    const memoryHalf = await batchedVisibility(page)
    expect(memoryHalf.visible).toBeGreaterThan(0)
    expect(memoryHalf.visible).toBeLessThanOrEqual(memoryHalf.total)

    await page.getByLabel('Distance from selection').check()
    const distanceHalf = await batchedVisibility(page)
    expect(distanceHalf.visible).toBeGreaterThan(0)
    expect(distanceHalf.visible).toBeLessThan(distanceHalf.total)

    // Full residency restores from any metric.
    await slider.press('End')
    await expect.poll(async () => (await batchedVisibility(page)).visible).toBe(initial.total)
  })
})
