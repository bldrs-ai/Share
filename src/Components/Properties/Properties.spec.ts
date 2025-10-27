import {expect, Locator, test} from '@playwright/test'
import {
  homepageSetup,
  setIsReturningUser,
} from '../../tests/e2e/utils'
import {waitForModelReady} from '../../tests/e2e/models'
import {TITLE} from './component'


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

      // APPROACH 3: Enhanced ARIA-based assertions (when ARIA attributes are added)
      // Uncomment these when the component has proper ARIA attributes:
      // const propertiesTableAria = propertiesPanel.getByRole('table', {name: 'Element properties'})
      // await expect(propertiesTableAria).toBeVisible()
      // await expect(propertiesPanel.getByRole('cell', {name: 'Property: Express Id'})).toBeVisible()
      // await expect(propertiesPanel.getByRole('cell', {name: 'Value: 621'})).toBeVisible()

      await expect(page).toHaveScreenshot('properties-panel-visible.png')
    })
  })
})


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
