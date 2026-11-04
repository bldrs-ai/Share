import {expect, test} from '@playwright/test'
import {watchEngineWorker} from '../tests/e2e/engineWorker'
import {describeMobileAndDesktop} from '../tests/e2e/formFactor'
import {waitForModelReady} from '../tests/e2e/models'
import {homepageSetup, setIsReturningUser} from '../tests/e2e/utils'


/**
 * An IFC load whose engine runs in its own worker (engine-worker.md §7 step
 * 3, `?feature=engineWorker`), end to end on the real pinned Conway: the
 * user opens a model and gets the same model they would without the flag —
 * geometry on screen, a URL-selected element's properties — while the
 * engine that produced it lives in `Engine.worker.js`.
 *
 * "In the worker" is checked by tests/e2e/engineWorker.ts#watchEngineWorker:
 * the model's engine session is a worker one (not the in-process fallback),
 * a Worker was created from `/Engine.worker.js`, and the main-thread pump's
 * line never printed.
 *
 * `index.ifc` is the Bldrs logo; `#621` is one of its proxies.
 */
describeMobileAndDesktop('Engine worker: IFC load', () => {
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
})
