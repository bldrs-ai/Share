import {Locator, expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {setupVirtualPathIntercept, waitForModelReady} from '../../tests/e2e/models'
import {homepageSetup, setIsReturningUser} from '../../tests/e2e/utils'


/**
 * Share#2075: the Properties table gave its label column half the width, so
 * the nested tables of an IfcGrid (UAxes -> Gridaxis -> AxisCurve -> ...) were
 * squeezed into the right half and third-level values were pushed off the
 * panel's edge; and the members of an entity array were separated by a bare
 * "," line. The fixture is box.ifc plus one grid (UAxes A and B, VAxes 1).
 */
const MODEL = '/share/v/gh/bldrs-ai/test-models/main/ifc/misc/grid-axes.ifc'
const GRID_PATH = '/100/500/9010'
// A table inside three others: the panel's, UAxes' value, an axis, its curve.
const THIRD_LEVEL_VALUE = 'table table table td[aria-label^="Value:"]'
const FIRST_VALUE = 'td[aria-label^="Value:"]'
const SNIPPET_LENGTH = 80
const FIRST_LABEL = 'td[aria-label^="Property:"]'


/**
 * @param locator
 * @return the element's bounding box, which must exist
 */
async function box(locator: Locator) {
  const b = await locator.boundingBox()
  expect(b, 'element has a box').not.toBeNull()
  return b as NonNullable<typeof b>
}


describeMobileAndDesktop('Properties: nested tables lay out within the panel', (ff) => {
  test.beforeEach(async ({page}) => {
    // The model load is in the test's own clock, and a cold desktop run is slow.
    const TEST_TIMEOUT = 90_000
    test.setTimeout(TEST_TIMEOUT)
    await homepageSetup(page)
    await setIsReturningUser(page.context())
    await setupVirtualPathIntercept(page, MODEL, '')
    await page.goto(`${MODEL}${GRID_PATH}`)
    await waitForModelReady(page)
    await page.getByTestId('control-button-properties').click()
    await expect(page.getByTestId('PropertiesPanel')).toBeVisible()
    await expect(page.getByTestId('PropertiesPanel').getByText('Gridaxis').first()).toBeVisible()
    // PROPS_SHOT_DIR=<dir> saves the panel for before/after comparison in a PR.
    if (process.env.PROPS_SHOT_DIR) {
      await page.getByTestId('PropertiesPanel').screenshot(
        {path: `${process.env.PROPS_SHOT_DIR}/${ff.name}.png`})
    }
  })

  test('the label cell is narrower than the value cell, at the top level and three levels down', async ({page}) => {
    const panel = page.getByTestId('PropertiesPanel')
    const topRow = panel.locator('tr', {has: page.locator(':scope > td[aria-label="Property: Express Id"]')}).first()
    // Points sits in AxisCurve's table: the third level down.
    const deepRow = panel.locator('table table table tr', {has: page.locator('td[aria-label="Property: Points"]')}).first()
    for (const row of [topRow, deepRow]) {
      const label = await box(row.locator(`:scope > ${FIRST_LABEL}`))
      const value = await box(row.locator(`:scope > ${FIRST_VALUE}`))
      expect(label.width).toBeLessThan(value.width)
    }
  })

  test('a third-level value cell lies within the panel', async ({page}) => {
    const panel = page.getByTestId('PropertiesPanel')
    const cells = panel.locator(THIRD_LEVEL_VALUE)
    expect(await cells.count()).toBeGreaterThan(0)
    const bounds = await box(panel)
    for (let i = 0; i < await cells.count(); i++) {
      const cell = await box(cells.nth(i))
      expect(cell.width).toBeGreaterThan(0)
      expect(cell.x).toBeGreaterThanOrEqual(bounds.x)
      expect(cell.x + cell.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1)
    }
    // The symptom was labels with no visible values: at the third level the
    // value cell must still be the wider one in its row (a fixed 50/50
    // split ties, which is why this is strict).
    const rows = panel.locator('table table table tr')
    expect(await rows.count()).toBeGreaterThan(0)
    for (let i = 0; i < await rows.count(); i++) {
      const row = rows.nth(i)
      const label = await box(row.locator(`:scope > ${FIRST_LABEL}`))
      const value = await box(row.locator(`:scope > ${FIRST_VALUE}`))
      expect(label.width).toBeLessThan(value.width)
    }
  })

  test('no bare "," separates nested table members', async ({page}) => {
    const panel = page.getByTestId('PropertiesPanel')
    // Guard against a vacuous pass: UAxes holds more than one axis table.
    const uAxes = panel.locator('tr', {has: page.locator(':scope > td[aria-label="Property: UAxes"]')}).first()
    expect(await uAxes.locator('td[aria-label="Value: Gridaxis"]').count()).toBeGreaterThan(1)
    const strayCommas = await panel.evaluate((root) => {
      const found: string[] = []
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        // A bare comma next to a nested table is the stray row. (A comma
        // inside a joined list of plain `#id Type` strings is legitimate.)
        if ((n.textContent ?? '').trim() === ',' && n.parentElement?.querySelector('table')) {
          found.push(n.parentElement.outerHTML.slice(0, SNIPPET_LENGTH))
        }
      }
      return found
    })
    expect(strayCommas).toEqual([])
  })
})
