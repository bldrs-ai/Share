import {expect, test} from '@playwright/test'
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
 * "In the worker" is checked twice, so neither can be faked by the other:
 * a Worker is created from `/Engine.worker.js`, and the main-thread engine's
 * own boundary line (`[conwayDirect] demand pump:`, which only
 * `parseIfcWithConway` prints) never appears, while the assembly's
 * (`[conwayDirect] parsed …`) does.
 *
 * `index.ifc` is the Bldrs logo; `#621` is one of its proxies.
 */
describeMobileAndDesktop('Engine worker: IFC load', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })

  test('the model loads, from a worker engine, with real geometry', async ({page}) => {
    const workerUrls: string[] = []
    page.on('worker', (worker) => workerUrls.push(worker.url()))
    const lines: string[] = []
    page.on('console', (msg) => lines.push(msg.text()))

    await page.goto('/share/v/p/index.ifc?feature=engineWorker')
    await waitForModelReady(page)

    expect(workerUrls.some((url) => url.endsWith('/Engine.worker.js')), workerUrls.join(', ')).toBe(true)
    expect(lines.filter((line) => line.includes('[conwayDirect] demand pump:'))).toEqual([])
    const parsed = lines.find((line) => line.includes('[conwayDirect] parsed'))
    expect(parsed, lines.join('\n')).toBeTruthy()
    const vertices = Number(parsed?.match(/vertices=(\d+)/)?.[1])
    const instances = Number(parsed?.match(/instances=(\d+)/)?.[1])
    expect(vertices).toBeGreaterThan(0)
    expect(instances).toBeGreaterThan(0)
  })

  test('a URL-selected element\'s properties come from the worker engine', async ({page}) => {
    const workerUrls: string[] = []
    page.on('worker', (worker) => workerUrls.push(worker.url()))
    await page.goto('/share/v/p/index.ifc/81/621?feature=engineWorker')
    await waitForModelReady(page)
    expect(workerUrls.some((url) => url.endsWith('/Engine.worker.js')), workerUrls.join(', ')).toBe(true)
    await page.getByTestId('control-button-properties').click()
    const propertiesPanel = page.getByTestId('PropertiesPanel')
    await expect(propertiesPanel).toBeVisible()
    const expressIdRow = propertiesPanel.locator('tr').filter({hasText: 'Express Id'})
    await expect(expressIdRow).toContainText('621')
    await expect(propertiesPanel).toContainText('Together')
  })
})
