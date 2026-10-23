import {expect, test} from '@playwright/test'
import {
  auth0Login,
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
} from '../../tests/e2e/utils'
import {expectScreen} from '../../tests/screens'


const {beforeEach, describe} = test

/**
 * Tests for saving models to GitHub.
 * Tests save button visibility and the complete save workflow.
 *
 * Migrated from cypress/e2e/versions-100/save-imported-model.cy.js
 *
 * @see https://github.com/bldrs-ai/Share/issues/980
 */
describe('Versions 100: Save model', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
  })

  describe('Returning user visits homepage', () => {
    beforeEach(async ({page}) => {
      await returningUserVisitsHomepageWaitForModel(page)
    })

    test('Save button visible, and opens for a signed-out user', async ({page}) => {
      // Signed out, Save opens like for anyone else (Share#1964; before that
      // it was a gate of its own, #1838). The gates are inside: GitHub says
      // to log in, and Export GLB carries the export gate.
      await expect(page.getByTestId('control-button-save')).toBeVisible({timeout: 10000})
      await expect(page.getByTestId('gated-save')).toHaveCount(0)
      await page.getByTestId('control-button-save').click()
      await expect(page.getByRole('dialog')).toBeVisible()
    })

    describe('User login', () => {
      beforeEach(async ({page}) => {
        await auth0Login(page)
      })

      test.skip('Save button visible, User inputs details and saves - Screens', async ({page}) => {
        const percyLabelPrefix = 'Versions 100: Save Model,'

        await expect(page.getByTitle('Save')).toBeVisible({timeout: 5000})
        await expectScreen(page, `${percyLabelPrefix} save button visible.png`)

        await page.getByTitle('Save').click({force: true})
        await page.getByRole('textbox', {name: 'Organization'}).click()
        await page.getByText('@cypresstester').click()
        await page.getByRole('textbox', {name: 'Repository'}).first().click()
        await page.getByText('test-repo').click()
        await page.getByRole('textbox', {name: 'Branch'}).first().click()
        await page.getByText('main').click()
        await page.getByRole('textbox', {name: 'Enter file name'}).click()
        await page.getByRole('textbox', {name: 'Enter file name'}).fill('save-model-test.ifc')
        await expectScreen(page, `${percyLabelPrefix} form filled.png`)

        await page.getByRole('button', {name: 'Save model'}).click()
        const animWaitTimeMs = 2000
        await page.waitForTimeout(animWaitTimeMs)
        await expectScreen(page, `${percyLabelPrefix} model visible after save.png`)
      })
    })
  })
})
