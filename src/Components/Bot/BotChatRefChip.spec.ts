import {expect, test} from '@playwright/test'
import {SCRIPT} from '../../assist/openrouterSse.fixture'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {waitForModelReady} from '../../tests/e2e/models'
import {homepageSetup, setIsReturningUser} from '../../tests/e2e/utils'


/**
 * Element chips in an assistant reply (#1673, assist-310). The scripted
 * model queries one proxy, then names it as `[Together](ref:<its ref>)`; the
 * chip must jump to that element in place, and its link must open Share on
 * the same element from cold.
 *
 * The renderer is left running: a camera move is camera-controls' transition,
 * which only advances while the render loop updates.
 *
 * `index.ifc` is the Bldrs logo: seven `Together` IfcBuildingElementProxy
 * elements under Build / Every / Thing.
 */
const IFC_PATH = '/share/v/p/index.ifc?feature=assist'
const DUMMY_KEY = 'sk-or-v1-playwright-dummy'


type StoreWindow = {
  useStore: {
    getState: () => {
      selectedAnchorIds?: Array<number | string>
      viewer: {context: {getCameraControls: () => {getPosition: () => {x: number, y: number, z: number}}}}
    }
  }
}


describeMobileAndDesktop('Assistant element chips', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
    await page.goto(IFC_PATH)
    await waitForModelReady(page)
  })

  test('a chip jumps to the element it names, and its link opens the same element', async ({page, context}) => {
    await page.getByTestId('control-button-ai-assistant').click()
    await expect(page.getByTestId('BotChat')).toBeVisible()
    await page.getByTestId('BotSettings-OpenButton').click()
    await page.getByLabel('Open Router API Key').fill(DUMMY_KEY)
    await page.getByTestId('BotSettings-OkButton').click()
    await page.getByRole('textbox', {name: 'Message the assistant'}).fill(SCRIPT.mentionPrompt)
    await page.keyboard.press('Enter')

    const reply = page.getByTestId('BotChat-Reply')
    const chip = reply.getByTestId('BotChat-RefChip')
    await expect(chip).toHaveText(SCRIPT.mentionedLabel)
    // The mention is a chip, not the Markdown's raw `ref:` text.
    expect(await reply.innerText()).not.toContain('ref:')

    // A ref no tool returned renders disabled, not as a link.
    const ghost = reply.getByTestId('BotChat-RefChip-Disabled')
    await expect(ghost).toHaveText(SCRIPT.ghostLabel)
    await expect(ghost).not.toHaveAttribute('href', /.*/)
    await expect(reply.getByRole('link')).toHaveCount(1)

    const selected = () => page.evaluate(() =>
      ((window as unknown as StoreWindow).useStore.getState().selectedAnchorIds ?? []).map(Number))
    const cameraAt = () => page.evaluate(() => {
      const {x, y, z} = (window as unknown as StoreWindow).useStore.getState().viewer.context
        .getCameraControls().getPosition()
      return [x, y, z]
    })
    // The reply's query read, it selected nothing.
    expect(await selected()).toEqual([])
    const before = await cameraAt()

    const ref = await chip.getAttribute('data-ref')
    const id = Number(ref?.replace(/^e/, ''))
    expect(Number.isFinite(id)).toBe(true)
    await chip.click()

    // Selected in the app, with no reload and no new page...
    await expect.poll(selected).toEqual([id])
    const permalink = await chip.getAttribute('href')
    expect(permalink).toContain('#sel:')
    // ...and framed: the camera has moved to it.
    await expect.poll(cameraAt).not.toEqual(before)

    // The link, copied out of Share, is a deep link: a cold page opens on the element.
    const cold = await context.newPage()
    await homepageSetup(cold)
    await cold.goto(permalink ?? '')
    await waitForModelReady(cold)
    await expect.poll(() => cold.evaluate(() =>
      ((window as unknown as StoreWindow).useStore.getState().selectedAnchorIds ?? []).map(Number))).toEqual([id])
    await cold.close()
  })
})
