import {Page, expect, test} from '@playwright/test'
import {watchEngineWorker} from '../tests/e2e/engineWorker'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {waitForModelReady} from '../tests/e2e/models'
import {homepageSetup, setIsReturningUser} from '../tests/e2e/utils'


/**
 * A Conway model load whose engine runs in its own worker (engine-worker.md
 * §7 steps 3 and 6, `?feature=engineWorker`), end to end on the real pinned
 * Conway, for both formats one worker load serves: the user opens a model
 * and gets the same model they would without the flag — geometry on
 * screen, a selected element's properties, and for STEP per-occurrence
 * selection — while the engine that produced it lives in
 * `Engine.worker.js`.
 *
 * "In the worker" is checked by tests/e2e/engineWorker.ts#watchEngineWorker:
 * the model's engine session is a worker one (not the in-process fallback),
 * no fallback warning printed, a Worker was created from
 * `/Engine.worker.js`, and the main-thread pump's line never printed. The
 * worker pump's own line names the format, so a STEP leg also proves it
 * was the STEP open that ran there.
 *
 * `index.ifc` is the Bldrs logo; `#621` is one of its proxies. `index.step`
 * is the same logo as an AP214 assembly (tools/models/README.md): seven
 * `Together` occurrences of two shared part shapes.
 */
const STEP_PATH = '/share/v/p/index.step?feature=engineWorker'
const STEP_LEAF = 'Together'
const STEP_LEAF_COUNT = 7
// A STEP parse + BREP tessellation, plus a cold worker wasm compile.
const STEP_TEST_TIMEOUT_MS = 90_000


/**
 * Watch for the worker pump's line (engineModelLoad.js), the one that says
 * which format the worker opened.
 *
 * @param page
 * @return the lines seen so far, live
 */
function watchPumpLines(page: Page): string[] {
  const lines: string[] = []
  page.on('console', (msg) => {
    const text = msg.text()
    if (text.includes('engine worker pump:')) {
      lines.push(text)
    }
  })
  return lines
}


/**
 * How many batched instances carry the selection's paint: the selection
 * resolved to geometry, and to how much of it. The same reading as
 * stepVisibility.spec.ts#paintedInstances.
 *
 * @param page
 * @return the painted instance count
 */
function paintedInstances(page: Page): Promise<number> {
  return page.evaluate(() => {
    let painted = 0
    /* eslint-disable @typescript-eslint/no-explicit-any */
    ;(window as any).useStore.getState().viewer.isolator.ifcModel.traverse((obj: any) => {
      painted += obj.userData?.batchedHighlight?.selSet?.size ?? 0
    })
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return painted
  })
}


describeMobileAndDesktop('Engine worker: model load', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })

  test('the model loads, from a worker engine, with real geometry', async ({page}) => {
    const engine = watchEngineWorker(page)
    const lines: string[] = []
    page.on('console', (msg) => lines.push(msg.text()))

    await page.goto('/share/v/p/index.ifc?feature=engineWorker')
    await waitForModelReady(page)

    await engine.expectWorkerEngine()
    const parsed = lines.find((line) => line.includes('[conwayDirect] parsed'))
    expect(parsed, lines.join('\n')).toBeTruthy()
    const vertices = Number(parsed?.match(/vertices=(\d+)/)?.[1])
    const instances = Number(parsed?.match(/instances=(\d+)/)?.[1])
    expect(vertices).toBeGreaterThan(0)
    expect(instances).toBeGreaterThan(0)
  })

  test('a URL-selected element\'s properties come from the worker engine', async ({page}) => {
    const engine = watchEngineWorker(page)
    await page.goto('/share/v/p/index.ifc/81/621?feature=engineWorker')
    await waitForModelReady(page)
    await engine.expectWorkerEngine()
    await page.getByTestId('control-button-properties').click()
    const propertiesPanel = page.getByTestId('PropertiesPanel')
    await expect(propertiesPanel).toBeVisible()
    const expressIdRow = propertiesPanel.locator('tr').filter({hasText: 'Express Id'})
    await expect(expressIdRow).toContainText('621')
    await expect(propertiesPanel).toContainText('Together')
  })

  test('a STEP assembly loads from the worker engine, one selectable occurrence per block', async ({page}) => {
    test.setTimeout(STEP_TEST_TIMEOUT_MS)
    const engine = watchEngineWorker(page)
    const pumpLines = watchPumpLines(page)

    await page.goto(STEP_PATH)
    await waitForModelReady(page)
    await engine.expectWorkerEngine()
    // The STEP open ran in the worker, windowed from its OPFS copy as an IFC
    // is (conway#757: the worker's stores read synchronously, which a
    // windowed STEP needs), and its pump delivered every block.
    expect(pumpLines, pumpLines.join('\n')).toHaveLength(1)
    expect(pumpLines[0]).toContain('format=step')
    expect(pumpLines[0]).toContain('windowed=yes')
    expect(Number(pumpLines[0].match(/meshes=(\d+)/)?.[1])).toBeGreaterThan(0)

    await page.getByTestId('control-button-navigation').click()
    await expect(page.getByTestId('NavTreePanel')).toBeVisible()
    const node = (label: string) => page.locator(`[data-node-label="${label}"]`)
    for (const name of ['Bldrs', 'Build', 'Every', 'Thing']) {
      await expect(node(name)).toHaveCount(1)
      await node(name).getByTestId('NavTreeNodeToggle').click()
    }
    // Seven occurrences, not two part types: the tree came from the
    // worker's AP214 index, per occurrence.
    await expect(node(STEP_LEAF)).toHaveCount(STEP_LEAF_COUNT)

    // Selecting one block selects exactly that block, in the tree AND in
    // the scene: the occurrence paths crossed the worker boundary onto the
    // batched instances, so the selection resolves to one instance, not to
    // every block sharing its part shape.
    await node(STEP_LEAF).first().getByTestId('NavTreeNodeLabel').click()
    await expect(node(STEP_LEAF).first()).toHaveAttribute('data-is-selected', 'true')
    await expect(page.locator('[data-is-selected="true"]')).toHaveCount(1)
    await expect.poll(() => paintedInstances(page)).toBe(1)
  })

  test('a selected STEP occurrence\'s properties come from the worker engine', async ({page}) => {
    test.setTimeout(STEP_TEST_TIMEOUT_MS)
    const engine = watchEngineWorker(page)
    await page.goto(STEP_PATH)
    await waitForModelReady(page)
    await engine.expectWorkerEngine()

    await page.getByTestId('control-button-navigation').click()
    const node = (label: string) => page.locator(`[data-node-label="${label}"]`)
    for (const name of ['Bldrs', 'Build', 'Every', 'Thing']) {
      await node(name).getByTestId('NavTreeNodeToggle').click()
    }
    const selectedId = () => page.evaluate(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).store.getState().selectedElement?.expressID ?? null)
    await node(STEP_LEAF).first().getByTestId('NavTreeNodeLabel').click()
    await expect.poll(selectedId).not.toBeNull()
    const first = await selectedId()

    await page.getByTestId('control-button-properties').click()
    const propertiesPanel = page.getByTestId('PropertiesPanel')
    await expect(propertiesPanel).toBeVisible()
    // The record is the worker's answer for THIS occurrence: every block is
    // named Together, so the name alone cannot tell them apart; the express
    // id row must be the selected occurrence's own.
    await expect(propertiesPanel).toContainText(STEP_LEAF)
    const expressIdValue = propertiesPanel.locator('tr').filter({hasText: 'Express Id'}).locator('td').last()
    await expect(expressIdValue).toHaveText(`${first}`)

    // Another block: another occurrence, another record.
    if (!(await page.getByTestId('NavTreePanel').isVisible())) {
      await page.getByRole('tab', {name: 'Nav'}).click()
    }
    await node(STEP_LEAF).last().getByTestId('NavTreeNodeLabel').click()
    await expect.poll(selectedId).not.toBe(first)
    const last = await selectedId()
    if (!(await propertiesPanel.isVisible())) {
      await page.getByRole('tab', {name: 'Props'}).click()
    }
    await expect(expressIdValue).toHaveText(`${last}`)
  })
})
