import {test} from '@playwright/test'
import {
  auth0Login,
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
} from '../../tests/e2e/utils'
import {setupVirtualPathIntercept, waitForModelReady} from '../../tests/e2e/models'
import {expectScreen} from '../../tests/screens'


const {beforeEach, describe} = test

/**
 * Tests for showing specific versions of a model.
 * Tests loading different versions and verifying the correct model is displayed.
 *
 * Migrated from cypress/e2e/versions-100/show-specific-version.cy.js
 *
 * @see https://github.com/bldrs-ai/Share/issues/1154
 */
describe('Versions 100: Show a specific version', () => {
  beforeEach(async ({page}) => {
    await homepageSetup(page)
  })

  describe('Returning user visits homepage', () => {
    beforeEach(async ({page}) => {
      await returningUserVisitsHomepageWaitForModel(page)
    })

    describe('User login', () => {
      beforeEach(async ({page}) => {
        await auth0Login(page)
      })

      const percyLabelPrefix = 'Versions 100: Show a specific version,'

      // TODO(https://github.com/bldrs-ai/Share/issues/1178)
      test.skip('Open Momentum.ifc, open versions component, select three versions', async ({page}) => {
        await page.getByTestId('control-button-open').click()
        await page.getByTestId('textfield-sample-projects').click()

        // set up initial momentum.ifc load
        await setupVirtualPathIntercept(
          page,
          '/share/v/gh/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc',
          '/Momentum.ifc',
        )

        // set up versioned momentum.ifc load (testsha commit)
        await setupVirtualPathIntercept(
          page,
          '/share/v/gh/Swiss-Property-AG/Momentum-Public/testsha1testsha1testsha1testsha1testsha1/Momentum.ifc',
          '/Momentum.ifc',
        )

        // set up versioned momentum.ifc load (testsha2 commit)
        await setupVirtualPathIntercept(
          page,
          '/share/v/gh/Swiss-Property-AG/Momentum-Public/testsha2testsha2testsha2testsha2testsha2/Momentum.ifc',
          '/Momentum.ifc',
        )

        // set up versioned momentum.ifc load (testsha3 commit)
        await setupVirtualPathIntercept(
          page,
          '/share/v/gh/Swiss-Property-AG/Momentum-Public/testsha3testsha3testsha3testsha3testsha3/Momentum.ifc',
          '/Momentum.ifc',
        )

        await page.getByText('Momentum').click()
        await waitForModelReady(page)

        // first commit version test
        await page.getByTestId('control-button-versions').click()
        const firstTimelineItem = page.getByTestId('timeline-list').locator('.MuiTimelineItem-root').nth(0)
        await firstTimelineItem.click()
        await waitForModelReady(page)

        await page.getByTestId('control-button-versions').click()

        const animWaitTimeMs = 1000
        await page.waitForTimeout(animWaitTimeMs)
        await expectScreen(page, `${percyLabelPrefix} first commit model visible with matching version selected.png`)

        // second commit version test
        const secondTimelineItem = page.getByTestId('timeline-list').locator('.MuiTimelineItem-root').nth(1)
        await secondTimelineItem.click()
        await waitForModelReady(page)

        await page.getByTestId('control-button-versions').click()

        await page.waitForTimeout(animWaitTimeMs)
        await expectScreen(page, `${percyLabelPrefix} second commit model visible with matching version selected.png`)

        // third commit version test
        const thirdTimelineItem = page.getByTestId('timeline-list').locator('.MuiTimelineItem-root').nth(2)
        await thirdTimelineItem.click()
        await waitForModelReady(page)

        await page.getByTestId('control-button-versions').click()
        await page.waitForTimeout(animWaitTimeMs)
        await expectScreen(page, `${percyLabelPrefix} third commit model visible with matching version selected.png`)
      })
    })
  })
})
