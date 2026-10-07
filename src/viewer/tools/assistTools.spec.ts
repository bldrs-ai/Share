import {Page, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {waitForModelReady} from '../../tests/e2e/models'
import {homepageSetup, pauseViewerRendering, setIsReturningUser} from '../../tests/e2e/utils'


/**
 * The Assist viewer tools (#1674, ai-workspace.md §9), driven the way the
 * agent loop will drive them — through the tool registry — via the
 * `?feature=assist` dev hook `window.__bldrsAssistTools`
 * (viewer/tools/assistHost.js). The assertions are on what the user sees
 * and shares, not on the tools' own reports: the NavTree row the selection
 * highlights, the URL path it writes, the batched instances actually drawn,
 * and the `#d:` permalink term isolation writes.
 *
 * `index.ifc` is the Bldrs logo: seven `Together` IfcBuildingElementProxy
 * elements under Build / Every / Thing.
 */
const IFC_PATH = '/share/v/p/index.ifc?feature=assist'
const PROXY_TYPE = 'IfcBuildingElementProxy'
const PROXY_LABEL = 'Together'
const PROXY_COUNT = 7


/** What `__bldrsAssistTools.call` resolves to (assistHost.js). */
interface CallResult {
  ok: boolean
  content?: {total?: number, items?: Array<{ref: string, type: string, name: string}>}
  echo?: string
  refs?: string[]
  error?: {code: string, message: string, details: Record<string, unknown>}
}


describeMobileAndDesktop('Assist view tools', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
    await page.goto(IFC_PATH)
    await waitForModelReady(page)
    // These tests read state (rows, instance visibility, the URL), not pixels.
    await pauseViewerRendering(page)
  })

  test('query finds the proxies; select highlights the row; isolate and undo change what is drawn', async ({page}) => {
    const query = await callTool(page, 'view.query', {ifcType: PROXY_TYPE})
    expect(query.ok, JSON.stringify(query.error)).toBe(true)
    expect(query.content?.total).toBe(PROXY_COUNT)
    expect(query.content?.items?.every(({name}) => name === PROXY_LABEL)).toBe(true)
    const ref = query.content?.items?.[1]?.ref as string
    expect(ref).toMatch(/^e\d+$/)
    const id = ref.substring(1)

    // Select: the NavTree highlights exactly that row, and the URL path names it.
    const select = await callTool(page, 'view.select', {refs: [ref]})
    expect(select.ok, JSON.stringify(select.error)).toBe(true)
    await expect.poll(() => new URL(page.url()).pathname).toMatch(new RegExp(`/${id}$`))
    const panel = await openTree(page)
    await expect(panel.locator('[data-is-selected="true"]')).toHaveCount(1)
    await expect(panel.locator('[data-is-selected="true"]')).toHaveAttribute('data-node-label', PROXY_LABEL)
    await closeTree(page)

    // Isolate: only that element's instances are drawn, and the link says so.
    const total = await visibleInstances(page)
    const own = await instancesOf(page, Number(id))
    expect(own).toBeGreaterThan(0)
    expect(own).toBeLessThan(total)
    const isolate = await callTool(page, 'view.isolate', {refs: [ref]})
    expect(isolate.ok, JSON.stringify(isolate.error)).toBe(true)
    await expect.poll(() => visibleInstances(page)).toBe(own)
    await expect.poll(() => hashToken(page, 'd')).toBe(`iso=${ref}`)

    // Undo: everything is drawn again and the term is gone.
    expect(await page.evaluate(() => (window as unknown as AssistWindow).__bldrsAssistTools.undo())).toBe(true)
    await expect.poll(() => visibleInstances(page)).toBe(total)
    await expect.poll(() => hashToken(page, 'd')).toBe(null)
  })

  test('a ref the model lacks fails the call, naming it, and changes nothing', async ({page}) => {
    const before = await visibleInstances(page)
    const result = await callTool(page, 'view.isolate', {refs: ['e999999']})
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('unresolved_refs')
    expect(JSON.stringify(result.error?.details)).toContain('e999999')
    expect(await visibleInstances(page)).toBe(before)
  })
})


/** The dev hook's surface, as far as these tests use it. */
interface AssistWindow {
  __bldrsAssistTools: {
    call: (name: string, input: unknown) => Promise<CallResult>
    undo: () => Promise<boolean>
  }
}


/**
 * @param page Playwright page
 * @param name tool name
 * @param input tool input
 * @return the dev hook's result
 */
function callTool(page: Page, name: string, input: unknown): Promise<CallResult> {
  return page.evaluate(([toolName, toolInput]) =>
    (window as unknown as AssistWindow).__bldrsAssistTools.call(toolName as string, toolInput),
  [name, input])
}


/**
 * Open the NavTree and expand it down to the proxies.
 *
 * @param page Playwright page
 * @return the panel
 */
async function openTree(page: Page) {
  const panel = page.getByTestId('NavTreePanel')
  if (!await panel.isVisible()) {
    await page.getByTestId('control-button-navigation').click()
  }
  await expect(panel).toBeVisible()
  for (const label of ['Bldrs', 'Build', 'Every', 'Thing']) {
    const row = panel.locator(`[data-node-label="${label}"]`).first()
    if (await row.getAttribute('data-is-expanded') === 'false') {
      await row.getByTestId('NavTreeNodeToggle').click()
    }
  }
  await expect(panel.locator(`[data-node-label="${PROXY_LABEL}"]`)).toHaveCount(PROXY_COUNT)
  return panel
}


/**
 * Close the NavTree, which covers the scene on a phone.
 *
 * @param page Playwright page
 */
async function closeTree(page: Page) {
  if (await page.getByTestId('NavTreePanel').isVisible()) {
    await page.getByTestId('control-button-navigation').click()
  }
  await expect(page.getByTestId('NavTreePanel')).not.toBeVisible()
}


/**
 * @param page Playwright page
 * @return how many batched instances are drawn
 */
function visibleInstances(page: Page): Promise<number> {
  return page.evaluate(() => {
    let visible = 0
    /* eslint-disable @typescript-eslint/no-explicit-any */
    ;(window as any).useStore.getState().viewer.isolator.ifcModel.traverse((obj: any) => {
      if (obj.isBatchedMesh && obj.instanceParents) {
        // Live ids only: three's getters throw on a deleted one, and ids
        // can be sparse (robustBounds.js walks `_instanceInfo` the same way).
        obj._instanceInfo.forEach((info: any, batchId: number) => {
          visible += info.active !== false && obj.getVisibleAt(batchId) ? 1 : 0
        })
      }
    })
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return visible
  })
}


/**
 * @param page Playwright page
 * @param id a product's express id
 * @return how many batched instances belong to it
 */
function instancesOf(page: Page, id: number): Promise<number> {
  return page.evaluate((product) => {
    let count = 0
    /* eslint-disable @typescript-eslint/no-explicit-any */
    ;(window as any).useStore.getState().viewer.isolator.ifcModel.traverse((obj: any) => {
      if (obj.isBatchedMesh && obj.instanceParents) {
        obj._instanceInfo.forEach((info: any, batchId: number) => {
          count += info.active !== false && obj.instanceParents[batchId] === product ? 1 : 0
        })
      }
    })
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return count
  }, id)
}


/**
 * @param page Playwright page
 * @param name the token's prefix
 * @return the token's value, or null without one
 */
function hashToken(page: Page, name: string): string | null {
  const token = new URL(page.url()).hash.substring(1).split(';').find((part) => part.startsWith(`${name}:`))
  return token ? token.substring(name.length + 1) : null
}
