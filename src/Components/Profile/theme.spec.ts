import {test, expect, Page} from '@playwright/test'
import {
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
} from '../../tests/e2e/utils'


/**
 * Profile 100: Theme - migrated from Cypress
 *
 * {@link https://github.com/bldrs-ai/Share/issues/1070}
 */
test.describe('Profile 100: Theme', () => {
  test.describe('Returning user visits homepage', () => {
    test.beforeEach(async ({page}) => {
      await homepageSetup(page)
      await returningUserVisitsHomepageWaitForModel(page)
    })

    test.describe('Select ProfileControl', () => {
      const idPrefix = 'control-button-profile-menu-item-theme'
      const checkAttr = async (page: Page, id: string, attrName: string, value: string) => {
        await expect(page.getByTestId(id)).toHaveAttribute(attrName, value)
      }

      test.beforeEach(async ({page}) => {
        await page.getByTestId('control-button-profile').click()
      })

      test('System theme (default) active - Screen', async ({page}) => {
        await checkAttr(page, `${idPrefix}-system`, 'aria-checked', 'true')
        await checkAttr(page, `${idPrefix}-day`, 'aria-checked', 'false')
        await checkAttr(page, `${idPrefix}-night`, 'aria-checked', 'false')
        // TODO: Add screenshot/visual testing equivalent to cy.percySnapshot()
      })

      test.describe('Select ProfileControl > Day theme', () => {
        test.beforeEach(async ({page}) => {
          await page.getByTestId(`${idPrefix}-day`).click()
          await page.getByTestId('control-button-profile').click() // reopen
        })

        test('Makes day theme active - Screen', async ({page}) => {
          await checkAttr(page, `${idPrefix}-system`, 'aria-checked', 'false')
          await checkAttr(page, `${idPrefix}-day`, 'aria-checked', 'true')
          await checkAttr(page, `${idPrefix}-night`, 'aria-checked', 'false')
          // TODO: Add screenshot/visual testing equivalent to cy.percySnapshot()
        })
      })

      test.describe('Select ProfileControl > Night theme', () => {
        test.beforeEach(async ({page}) => {
          await page.getByTestId(`${idPrefix}-night`).click()
          await page.getByTestId('control-button-profile').click() // reopen
        })

        test('Makes night theme active - Screen', async ({page}) => {
          await checkAttr(page, `${idPrefix}-system`, 'aria-checked', 'false')
          await checkAttr(page, `${idPrefix}-day`, 'aria-checked', 'false')
          await checkAttr(page, `${idPrefix}-night`, 'aria-checked', 'true')
          // TODO: Add screenshot/visual testing equivalent to cy.percySnapshot()
        })
      })
    })
  })
})
