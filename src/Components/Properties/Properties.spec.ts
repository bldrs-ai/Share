import {Locator, Page, expect, test} from '@playwright/test'
import {
  homepageSetup,
  setIsReturningUser,
} from '../../tests/e2e/utils'
import {waitForModelReady} from '../../tests/e2e/models'
import {TITLE} from './component'
// import {expectScreen} from '../../tests/screens'


const {beforeEach, describe} = test
/**
 * Migrated from cypress/e2e/view-100/access-element-properties.cy.js
 *
 * @see https://github.com/bldrs-ai/Share/issues/1242
 */
describe('View 100: Access elements property', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })

  describe('User visits permalink to selected element and clicks properties control', () => {
    beforeEach(async ({page}) => {
      // Navigate to the element path and wait for model
      await page.goto('/share/v/p/index.ifc/81/621')
      await waitForModelReady(page)

      // Click the properties control button
      await page.getByTestId('control-button-properties').click()
    })

    test('Side drawer containing properties is visible - Screen', async ({page}) => {
      await expect(page.getByTestId('control-button-properties')).toBeVisible()
      await expect(page.getByTestId(`PanelTitle-${TITLE}`)).toContainText(TITLE)

      // Get properties panel and verify it's visible
      const propertiesPanel = page.getByTestId('PropertiesPanel')
      await expect(propertiesPanel).toBeVisible()

      // APPROACH 1: Basic table structure verification
      const propertiesTable = propertiesPanel.locator('table')
      await expect(propertiesTable).toBeVisible()

      const ifcTypeRow = propertiesPanel.locator('tr').filter({hasText: 'IFC Type'})
      await expect(ifcTypeRow).toBeVisible()

      await assertPropertyValue(propertiesPanel, 'Express Id', '621')
      await assertPropertyValue(propertiesPanel, 'Name', 'Together')


      await expectScreenshotWithFontDiag(page, 'properties-panel-visible.png')
    })
  })
})


/**
 * Takes a screenshot if not running in GitHub Actions
 *
 * @param page - Playwright page object
 * @param name - Screenshot name
 */
export async function expectScreenshotWithFontDiag(page: Page, name: string) {
  // 1) Wait for webfonts to finish loading (prevents first-paint fallback)
  await page.evaluate(async () => {
    if (document.fonts?.status !== 'loaded') {
      await document.fonts?.ready
    }
  })

  // 2) Pull a representative node (your “621” cell)
  const target = page.locator('text=621').first()

  // 3) Gather diagnostics in the page context
  const diag = await target.evaluate((el) => {
    const getFont = (e: Element) => getComputedStyle(e).fontFamily
    const fam = getFont(el)

    // Is Roboto (400/16px) actually available?
    const hasRoboto = document.fonts?.check?.('400 16px "Roboto"') ?? false

    // Infer which family is used by width comparison
    // (Render to an offscreen canvas with different families)
    const text = (el.textContent || '621').trim() || '621'
    const style = getComputedStyle(el)
    const size = style.fontSize || '16px'
    const weight = style.fontWeight || '400'

    const measure = (family: string) => {
      const c = document.createElement('canvas')
      const ctx = c.getContext('2d')
      if (!ctx) {
        throw new Error('Failed to get context')
      }
      ctx.font = `${weight} ${size} ${family}`
      return ctx.measureText(text).width
    }

    const wActual = (el as HTMLElement).getBoundingClientRect().width
    const wRoboto = measure('"Roboto"')
    const wHelvetica = measure('"Helvetica"')
    const wArial = measure('"Arial"')
    const wSerif = measure('serif')

    // Guess the closest
    const diffs = [
      ['Roboto', Math.abs(wActual - wRoboto)],
      ['Helvetica', Math.abs(wActual - wHelvetica)],
      ['Arial', Math.abs(wActual - wArial)],
      ['serif', Math.abs(wActual - wSerif)],
    ].sort((a, b) => {
      const aa = a[1] as number
      const bb = b[1] as number
      return aa - bb
    })

    return {
      computedFontFamily: fam,
      documentFontsStatus: document.fonts?.status,
      hasRoboto,
      widths: {
        actual: wActual, Roboto: wRoboto, Helvetica: wHelvetica, Arial: wArial, serif: wSerif,
      },
      likelyUsed: diffs[0][0],
      textSample: text,
      cssSnapshot: {
        fontSize: size,
        fontWeight: weight,
        fontSynthesis: style.fontSynthesis,
      },
    }
  })

  console.warn(`[font-diag]`, JSON.stringify(diag, null, 2))

  try {
    await expect(page).toHaveScreenshot(name)
  } catch (err) {
    console.error(`❌ Screenshot mismatch: ${name}`)
    console.error(`[font-diag summary] likelyUsed=${diag.likelyUsed}, hasRoboto=${diag.hasRoboto}, status=${diag.documentFontsStatus}`)
    throw err
  }
}


/**
 * Helper function to assert on property-value pairs in a more semantic way
 * This approach tests the actual data structure rather than just text content
 *
 * @param propertiesPanel - The properties panel locator to search within
 * @param propertyName - The name of the property to find
 * @param expectedValue - The expected value for that property
 */
async function assertPropertyValue(propertiesPanel: Locator, propertyName: string, expectedValue: string) {
  const propertyRow = propertiesPanel.locator('tr').filter({hasText: propertyName})
  await expect(propertyRow).toBeVisible()
  await expect(propertyRow).toContainText(expectedValue)
}
