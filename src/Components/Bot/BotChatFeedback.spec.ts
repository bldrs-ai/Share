import {Page, expect, test} from '@playwright/test'
import {SCRIPT} from '../../assist/openrouterSse.fixture'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {waitForModelReady} from '../../tests/e2e/models'
import {homepageSetup, setIsReturningUser} from '../../tests/e2e/utils'


/**
 * Rating an assistant reply (Share#2306), the first client of the feedback
 * module (design/tracks/community-t100/feedback.md). The reply comes from MSW's stand-in for
 * Bldrs' hosted relay (as in BotChat.spec.ts), and the store is MSW's
 * stand-in for `netlify/functions/feedback.js`, which keeps what it is sent
 * on `window.__mockFeedback`. GA events land in `window.dataLayer`, the GA
 * loader being skipped in tests (as quota/directLinkSoftGate.spec.ts reads
 * them).
 *
 * The viewer is NOT paused here (unlike BotChat.spec.ts): the screenshot is
 * read from the canvas in the task of a real paint (viewer/frameCapture.js),
 * which a paused viewer never makes.
 *
 * `index.ifc` is a Share-hosted sample, so the record names it by ref; the
 * prompt and reply are kept as written.
 */
const IFC_PATH = '/share/v/p/index.ifc?feature=assist'
const PROXY_COUNT = 7
const NOTE = 'It should have selected the walls'
const PLACEHOLDER = 'Add a note (optional): what was right or wrong?'


interface StoredRecord {
  source: string
  rating: string
  note: string
  screenshot: string | null
  view: {model: {ref: string | null, route_kind: string | null}, camera: object | null}
  context: {prompt: string, reply: string, steps: number, tool_calls: number}
}


describeMobileAndDesktop('Assistant reply feedback', (ff) => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
    await page.goto(IFC_PATH)
    await waitForModelReady(page)
  })

  test('rates a reply with a note and a screenshot, which reach the store; GA gets structured fields only', async ({page}) => {
    await page.getByTestId('control-button-ai-assistant').click()
    await expect(page.getByTestId('BotChat')).toBeVisible()
    await page.getByRole('textbox', {name: 'Message the assistant'}).fill(SCRIPT.selectPrompt)
    await page.keyboard.press('Enter')
    await expect(page.getByText(SCRIPT.selectedAnswer(PROXY_COUNT))).toBeVisible()

    // The thumbs: hidden until the reply is hovered on a desktop, always
    // shown on a phone, where there is no hover.
    const group = page.getByTestId('BotChat-ReplyGroup')
    await expect(group).toHaveCount(1)
    const thumbs = group.getByTestId('BotChat-Feedback')
    if (ff.isMobile) {
      await expect(thumbs).toHaveCSS('opacity', '1')
    } else {
      await page.getByRole('textbox', {name: 'Message the assistant'}).hover()
      await expect(thumbs).toHaveCSS('opacity', '0')
      await group.getByTestId('BotChat-Reply').hover()
      await expect(thumbs).toHaveCSS('opacity', '1')
    }

    const bad = group.getByRole('button', {name: 'Bad reply'})
    await bad.click()
    await expect(bad).toHaveAttribute('aria-pressed', 'true')
    const note = page.getByPlaceholder(PLACEHOLDER)
    await expect(note).toBeVisible()
    await expect(page.getByText('shared with Bldrs to improve the assistant')).toBeVisible()

    // Attach, remove with the ×, attach again.
    await page.getByRole('button', {name: 'Attach screenshot'}).click()
    const thumbnail = page.getByTestId('Feedback-Screenshot')
    await expect(thumbnail).toBeVisible()
    await expect(thumbnail.locator('img')).toHaveAttribute('src', /^data:image\/jpeg;base64,/)
    await page.getByRole('button', {name: 'Remove screenshot'}).click()
    await expect(thumbnail).toHaveCount(0)
    await page.getByRole('button', {name: 'Attach screenshot'}).click()
    await expect(thumbnail).toBeVisible()

    await note.fill(NOTE)
    await page.getByTestId('Feedback-Send').click()
    await expect(page.getByText('Thanks for the feedback')).toBeVisible()
    await expect(page.getByTestId('Feedback-Note')).toHaveCount(0)
    // The chosen thumb stays filled.
    await expect(bad).toHaveAttribute('aria-pressed', 'true')

    const records = await storedRecords(page)
    expect(records).toHaveLength(1)
    const [record] = records
    expect(record).toMatchObject({source: 'assist_reply', rating: 'down', note: NOTE})
    expect(record.screenshot).toMatch(/^data:image\/jpeg;base64,[A-Za-z0-9+/]{1000,}={0,2}$/)
    expect(record.context.prompt).toBe(SCRIPT.selectPrompt)
    expect(record.context.reply).toContain(SCRIPT.selectedAnswer(PROXY_COUNT))
    expect(record.context.tool_calls).toBe(2)
    expect(record.view.model).toMatchObject({route_kind: 'project'})
    expect(record.view.model.ref).toMatch(/\/index\.ifc$/)
    expect(record.view.camera).not.toBeNull()

    const events = await gaEvents(page, 'feedback_submitted')
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({
      feedback_id: expect.any(String), feedback_source: 'assist_reply', rating: 'down', has_note: 'true',
      has_screenshot: 'true', tier: 'anon', source: 'hosted', route_kind: 'project', model_choice: 'default',
      steps: record.context.steps, tool_calls: 2,
    })
    // The one thing GA and the store share.
    expect(Object.keys(await storedById(page))).toEqual([events[0].feedback_id])
    const sent = JSON.stringify(events)
    for (const text of [NOTE, SCRIPT.selectPrompt, SCRIPT.selectedAnswer(PROXY_COUNT), 'base64', 'index.ifc']) {
      expect(sent).not.toContain(text)
    }
  })
})


/**
 * @param page
 * @return what MSW's feedback store holds, by feedback_id
 */
async function storedById(page: Page): Promise<Record<string, StoredRecord>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await page.evaluate(() => (window as any).__mockFeedback ?? {})
}


/**
 * @param page
 * @return the stored records
 */
async function storedRecords(page: Page): Promise<StoredRecord[]> {
  return Object.values(await storedById(page))
}


/**
 * @param page
 * @param name GA event name
 * @return each such event's params, as gtag queued them
 */
async function gaEvents(page: Page, name: string): Promise<Array<Record<string, unknown>>> {
  return await page.evaluate((eventName) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dataLayer: any[] = (window as any).dataLayer || []
    return dataLayer
      .filter((entry) => entry?.[0] === 'event' && entry?.[1] === eventName)
      .map((entry) => JSON.parse(JSON.stringify(entry[2] ?? {})))
  }, name)
}
