import {expect, test} from '@playwright/test'
import {TITLE_NOTES} from './component'
import {
  auth0Login,
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
} from '../../tests/e2e/utils'
import {expectScreen} from '../../tests/screens'


const {beforeEach, describe} = test

/**
 * Tests for Notes list functionality.
 * Tests accessing the notes list, selecting notes, and navigation.
 *
 * Migrated from cypress/e2e/notes-100/access-notes-list.cy.js
 * and cypress/e2e/notes-100/select-a-note.cy.js
 *
 * @see https://github.com/bldrs-ai/Share/issues/1054
 * @see https://github.com/bldrs-ai/Share/issues/1055
 */
describe('Notes: List operations', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
  })

  describe('Access notes list', () => {
    beforeEach(async ({page}) => {
      await returningUserVisitsHomepageWaitForModel(page)
    })

    describe('Open Notes', () => {
      beforeEach(async ({page}) => {
        await page.getByTestId('control-button-notes').click()
      })

      test('Notes visible - Screen', async ({page}) => {
        await expect(page.getByTestId('list-notes')).toBeVisible()
        await expect(page.getByTestId(`PanelTitle-${TITLE_NOTES}`)).toContainText(TITLE_NOTES)
        await expectScreen(page, 'Notes-access-notes-list.png')
      })
    })

    describe('Open Notes - authenticated', () => {
      beforeEach(async ({page}) => {
        await auth0Login(page)
        await page.getByTestId('control-button-notes').click()
      })

      test('Notes visible - Screen', async ({page}) => {
        await expect(page.getByTestId('list-notes')).toBeVisible()
        await expect(page.getByTestId(`PanelTitle-${TITLE_NOTES}`)).toContainText(TITLE_NOTES)
        await expectScreen(page, 'Notes-access-notes-list-authenticated.png')
      })
    })
  })

  describe('Select a note', () => {
    beforeEach(async ({page}) => {
      await returningUserVisitsHomepageWaitForModel(page)
    })

    describe('Open Notes > first note', () => {
      beforeEach(async ({page}) => {
        await page.getByTestId('control-button-notes').click()
        await page.getByTestId('list-notes').locator(':nth-child(1) > [data-testid="note-body"]').first().click()
      })

      test('Shows title, comments and new nav state', async ({page}) => {
        // The list of notes is updated to display only the selected note.
        // Its comments render below it as note cards too, each with an EMPTY
        // .MuiCardHeader-title, so a bare `.MuiCardHeader-title` locator
        // matches 1 element before the comments arrive and 3 after, and a
        // strict-mode assertion on it fails outright once they land (main
        // after #2142, shard 3). Count only the titles that carry text: that
        // is exactly "one note shown", and it waits out the switch from the
        // full list rather than racing the comment fetch.
        const noteTitles = page.locator('.MuiCardHeader-title').filter({hasText: /\S/})
        await expect(noteTitles).toHaveCount(1)
        await expect(noteTitles).toHaveText('issueTitle_4')

        // A list of comments attached to the note to be visible
        await expect(page.getByTestId('list-notes').locator(':nth-child(4) > [data-testid="note-card"] p')).toContainText('testComment_1')
        await expect(page.getByTestId('list-notes').locator(':nth-child(5) > [data-testid="note-card"] p')).toContainText('testComment_2')

        await expect(page.getByTestId('PanelTitle-Note')).toHaveText('Note')

        await page.getByTestId('Back to the list').click()

        // Ensure we navigate back to the full list of notes
        await expect(page.getByTestId('list-notes')).toBeVisible()
        await expect(page.getByTestId('list-notes').locator(':nth-child(1) > [data-testid="note-body"]').first()).toBeVisible()

        await expectScreen(page, 'Notes-select-note.png')
      })
    })
  })
})
