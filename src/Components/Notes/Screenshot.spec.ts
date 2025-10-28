import {expect, test} from '@playwright/test'


const {beforeEach, describe} = test

/**
 * Tests for screenshot functionality in Notes.
 * This feature allows users to take screenshots from within notes.
 *
 * Migrated from cypress/e2e/screenshot/screen-from-note.cy.js
 */
describe.skip('Note screenshot', () => {
  describe('enable/disable feature using url parameter', () => {
    beforeEach(async ({page}) => {
      await page.context().addCookies([{name: 'isFirstTime', value: '1', url: page.url()}])
      await page.goto('/')
    })

    test('should not show screenshot button when url param not present', async ({page}) => {
      await expect(page.getByRole('button', {name: /Take Screenshot/})).toHaveCount(0)
    })

    test('should show screenshot when url param present', async ({page}) => {
      await page.goto('/share/v/p/index.ifc?feature=screenshot')
      await page.getByTitle('Notes').click()
      await expect(page.getByRole('button', {name: 'Take Screenshot'})).toBeVisible()
    })
  })
})
