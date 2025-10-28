import {expect, test, Route} from '@playwright/test'
import {readFile} from 'fs/promises'
import path from 'path'
import {
  homepageSetup,
  setIsReturningUser,
  visitHomepageWaitForModel,
} from '../../tests/e2e/utils'
import {waitForModelReady} from '../../tests/e2e/models'
import {expectScreen} from '../../tests/screens'


const {beforeEach, describe} = test

/**
 * Migrated from cypress/e2e/view-100/synchronized-view-and-navtree.cy.js
 *
 * @see https://github.com/bldrs-ai/Share/issues/1046
 */
describe.skip('View 100: Synchronized View and NavTree', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
  })

  describe('User visits homepage, Open NavTree > select item', () => {
    beforeEach(async ({page}) => {
      await visitHomepageWaitForModel(page)
      await page.getByTestId('control-button-navigation').click()

      // Navigate through the tree structure
      await page.getByText('Bldrs').click()
      await page.getByText('Build').click()
      await page.getByText('Every').click()
      await page.getByText('Thing').click()

      // Click through multiple "Together" items
      const togetherItems = page.getByText('Together')
      for (let i = 0; i < 7; i++) {
        await togetherItems.nth(i).click()
      }
    })

    test('Item highlighted in tree and scene - Screen', async ({page}) => {
      await expectScreen(page, 'SynchronizedView-item-highlighted.png')
    })
  })

  describe('Visits permalink to selected element', () => {
    beforeEach(async ({page}) => {
      // TODO(pablo): root id selection doesn't work after search state working.  Also move this to a helper
      await page.route('**/share/v/p/index.ifc/81/621', async (route: Route) => {
        const fixturePath = path.resolve(process.cwd(), 'src/tests/fixtures/404.html')
        const fixtureBuffer = await readFile(fixturePath)

        await route.fulfill({
          status: 200,
          body: fixtureBuffer,
          headers: {'content-type': 'text/html'},
        })
      })

      await page.goto('/share/v/p/index.ifc/81/621')
      await waitForModelReady(page)
    })

    test('Item highlighted in scene - Screen', async ({page}) => {
      // Check that nav-tree-root doesn't exist (no tree visible)
      await expect(page.getByTestId('PanelBox-Navigation')).toHaveCount(0)
      await expectScreen(page, 'SynchronizedView-permalink-highlighted.png')
    })
  })
})
