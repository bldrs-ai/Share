import {expect, test} from '@playwright/test'
import {
  auth0Login,
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
} from '../../tests/e2e/utils'
import {expectScreen} from '../../tests/screens'


const {beforeEach, describe} = test

/**
 * Tests for Comment CRUD operations.
 * Tests creating, editing, and deleting comments on notes.
 *
 * Migrated from cypress/e2e/notes-100/comments-on-a-note.cy.js,
 * cypress/e2e/notes-100/comment-edit-delete.cy.js, and
 * cypress/e2e/notes-100/access-shared-note.cy.js
 *
 * @see https://github.com/bldrs-ai/Share/issues/978
 */
describe('Comment: CRUD operations', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
  })

  describe('Comments on a note', () => {
    beforeEach(async ({page}) => {
      await returningUserVisitsHomepageWaitForModel(page)
    })

    describe('Open Notes > first note', () => {
      beforeEach(async ({page}) => {
        await page.getByTestId('control-button-notes').click()
        await page.getByTestId('list-notes').locator(':nth-child(1) > [data-testid="note-body"]').first().click()
      })

      test('Please login message to be visible', async ({page}) => {
        await expect(page.locator('.MuiCardHeader-title')).toContainText('issueTitle_4')
        await expectScreen(page, 'Comment-login-required.png')
      })

      test('Create a comment card to be visible', async ({page}) => {
        await auth0Login(page)
        await expect(page.getByPlaceholder('Leave a comment ...')).toBeVisible()
        await expectScreen(page, 'Comment-form.png')
      })

      test('Allows writing over 256 characters in the comment box', async ({page}) => {
        await auth0Login(page)
        const LONG_TEXT_LENGTH = 300
        const longText = 'a'.repeat(LONG_TEXT_LENGTH) // 300 characters
        const commentInput = page.getByPlaceholder('Leave a comment ...')
        await commentInput.fill(longText)
        await expect(commentInput).toHaveValue(longText) // Assert that the textbox contains the long input
        await expectScreen(page, 'Comment-long-text.png')
      })
    })
  })
})
