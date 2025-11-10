import {test} from '@playwright/test'
import {
  auth0Login,
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
} from '../../tests/e2e/utils'
import {setupGithubPathIntercept} from '../../tests/e2e/models'
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

      const screenLabelPrefix = 'Versions 100: Show a specific version,'

      // TODO(https://github.com/bldrs-ai/Share/issues/1178)
      test('Open Momentum.ifc, open versions component, select three versions', async ({page}) => {
        await page.getByTestId('control-button-open').click()
        const openDialog = page.getByRole('dialog', {name: 'Open'})
        openDialog.getByRole('tab', {name: 'Samples'}).click()

        const fixturePathname = 'test-models/ifc/misc/box.ifc'
        // set up initial momentum.ifc load
        let branch = 'main'
        let githubPath = `/Swiss-Property-AG/Momentum-Public/${branch}/Momentum.ifc`
        let gotoPath = `/share/v/gh/Swiss-Property-AG/Momentum-Public/${branch}/Momentum.ifc`
        const gotoMainWait = await setupGithubPathIntercept(page, githubPath, gotoPath, fixturePathname)
        const momentumChip = openDialog.getByText('Momentum')
        await momentumChip.click()
        await gotoMainWait()

        // first commit version test
        branch = 'testsha1testsha1testsha1testsha1testsha1'
        githubPath = `/Swiss-Property-AG/Momentum-Public/${branch}/Momentum.ifc`
        gotoPath = `/share/v/gh/Swiss-Property-AG/Momentum-Public/${branch}/Momentum.ifc`
        const goto1Wait = await setupGithubPathIntercept(page, githubPath, gotoPath, fixturePathname)
        await page.getByTestId('control-button-versions').click()
        const firstTimelineItem = page.getByTestId('timeline-list').locator('.MuiTimelineItem-root').nth(0)
        await firstTimelineItem.click()
        await goto1Wait()
        await page.getByTestId('control-button-versions').click()
        await expectScreen(page, `${screenLabelPrefix} first commit model visible with matching version selected.png`)

        // second commit version test
        branch = 'testsha2testsha2testsha2testsha2testsha2'
        githubPath = `/Swiss-Property-AG/Momentum-Public/${branch}/Momentum.ifc`
        gotoPath = `/share/v/gh/Swiss-Property-AG/Momentum-Public/${branch}/Momentum.ifc`
        const goto2Wait = await setupGithubPathIntercept(page, githubPath, gotoPath, fixturePathname)
        const secondTimelineItem = page.getByTestId('timeline-list').locator('.MuiTimelineItem-root').nth(1)
        await secondTimelineItem.click()
        await goto2Wait()
        await page.getByTestId('control-button-versions').click()
        await expectScreen(page, `${screenLabelPrefix} second commit model visible with matching version selected.png`)

        // third commit version test
        branch = 'testsha3testsha3testsha3testsha3testsha3'
        githubPath = `/Swiss-Property-AG/Momentum-Public/${branch}/Momentum.ifc`
        gotoPath = `/share/v/gh/Swiss-Property-AG/Momentum-Public/${branch}/Momentum.ifc`
        const goto3Wait = await setupGithubPathIntercept(page, githubPath, gotoPath, fixturePathname)
        const thirdTimelineItem = page.getByTestId('timeline-list').locator('.MuiTimelineItem-root').nth(2)
        await thirdTimelineItem.click()
        await goto3Wait()
        await page.getByTestId('control-button-versions').click()
        await expectScreen(page, `${screenLabelPrefix} third commit model visible with matching version selected.png`)
      })
    })
  })
})
