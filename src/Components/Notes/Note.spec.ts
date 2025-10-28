import {expect, test} from '@playwright/test'
import {TITLE_NOTE_ADD} from './component'
import {
  auth0Login,
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
} from '../../tests/e2e/utils'
import {expectScreen} from '../../tests/screens'


const {beforeEach, describe} = test

/**
 * Tests for Note CRUD operations.
 * Tests creating, editing, deleting, and sharing individual notes.
 *
 * Migrated from cypress/e2e/notes-100/create-a-note.cy.js,
 * cypress/e2e/notes-100/delete-a-note.cy.js, and
 * cypress/e2e/notes-100/share-a-note.cy.js
 *
 * @see https://github.com/bldrs-ai/Share/issues/1059
 * @see https://github.com/bldrs-ai/Share/issues/1058
 * @see https://github.com/bldrs-ai/Share/issues/1071
 */
describe('Note: CRUD operations', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
  })

  describe('Create a note', () => {
    beforeEach(async ({page}) => {
      await returningUserVisitsHomepageWaitForModel(page)
    })

    describe('Open Notes', () => {
      beforeEach(async ({page}) => {
        await auth0Login(page)
        await page.getByTestId('control-button-notes').click()
        await page.getByTestId('Add a note').click()
      })

      test('Notes list switches to display only create note card and back to the list when nav backbutton is pressed', async ({page}) => {
        await expect(page.getByTestId('Back to the list')).toBeVisible()
        await expect(page.getByPlaceholder('Note Title')).toBeVisible()
        await expect(page.getByTestId(`PanelTitle-${TITLE_NOTE_ADD}`)).toContainText(TITLE_NOTE_ADD)
        await expectScreen(page, 'Note-create-note-form.png')

        await page.getByTestId('Back to the list').click()
        await expect(page.getByTestId('list-notes')).toBeVisible()
      })

      // TODO(oleg): the final check with the created note appended to the top of the list
      // will be implemented when Pablo finishes the github store mock
      test.skip('When note is created, navigate to the notes list with a new note created at the top of the list', async ({page}) => {
        // Ensure we're in the create note form
        await expect(page.getByPlaceholder('Note Title')).toBeVisible()
        await page.getByPlaceholder('Note Title').click()
        await page.getByPlaceholder('Note Title').fill('New Note Title')
        await page.getByPlaceholder('Note Body').click()
        await page.getByPlaceholder('Note Body').fill('New Note Body')
        await expect(page.getByTestId('Submit')).toBeEnabled()
        await page.getByTestId('Submit').click()
        await expect(page.getByTestId('list-notes')).toBeVisible()
        await expect(page.getByTestId('list-notes').locator('.MuiCardHeader-title').first()).toContainText('issueTitle_4')
        await expectScreen(page, 'Note-note-created.png')
      })
    })
  })

  describe('Delete a note', () => {
    describe('User visits homepage in the logged-in state', () => {
      beforeEach(async ({page}) => {
        await homepageSetup(page)
        await returningUserVisitsHomepageWaitForModel(page)
        await page.goto('/share/v/p/index.ifc#c:-133.022,131.828,161.85,-38.078,22.64,-2.314')
        await auth0Login(page)
      })

      test('Correct project to be loaded into the viewport and side drawer to be open - Screen', async ({page}) => {
        await page.getByTestId('control-button-notes').click()
        await page.locator(':nth-child(1) > [data-testid="note-card"] [data-testid="note-menu-button"]').click()
        await expectScreen(page, 'Note-delete-note-menu.png')
        await page.locator('.MuiList-root > [tabindex="-1"]').click()
        // ToDo: the final check with the deleted note disappearing from the list
        // will be implemented when Pablo finished the github store mock
      })
    })
  })

  describe('Share a note', () => {
    beforeEach(async ({page}) => {
      await homepageSetup(page)
    })

    describe('Returning user visits homepage', () => {
      beforeEach(async ({page}) => {
        await returningUserVisitsHomepageWaitForModel(page)
      })

      describe('Open Notes > first note, click share in note footer', () => {
        beforeEach(async ({page}) => {
          await page.getByTestId('control-button-notes').click()
          await page.getByTestId('list-notes').getByTestId('note-body').first().click()

          // Mock clipboard API
          await page.addInitScript(() => {
            Object.defineProperty(navigator, 'clipboard', {
              value: {
                writeText: () => Promise.resolve(),
              },
              writable: true,
            })
          })

          await page.locator('.MuiCardActions-root [data-testid="Share"] > .icon-share').first().click()
        })

        test('Link copied, SnackBar reports that - Screen', async ({page}) => {
          // Verify snackbar message
          await expect(page.getByTestId('snackbar')).toContainText('The url path is copied to the clipboard')
          await expectScreen(page, 'Note-share-note.png')
        })
      })
    })
  })
})
