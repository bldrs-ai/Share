import {expect, test} from '@playwright/test'
import {describeMobileAndDesktop} from '../../tests/e2e/formFactor'
import {waitForModelReady} from '../../tests/e2e/models'
import {homepageSetup, setIsReturningUser} from '../../tests/e2e/utils'


// The home model with one element selected, so the element group's Clear
// button is showing.
const SELECTED_ELEMENT_PATH = '/share/v/p/index.ifc/81/621'


/**
 * open-205 #2014. Clear (the X beside a selection) deletes the cut planes
 * from the scene along with the selection, and is meant to reset the
 * cut-plane state with them. CadView passed that reset its arguments one
 * slot off, so it did nothing: the planes left the scene while the menu
 * still showed them checked, and choosing one again "removed" a plane that
 * was already gone instead of adding it.
 */
describeMobileAndDesktop('Cutplanes: Clear with a cut plane active', () => {
  test.beforeEach(async ({page}) => {
    await homepageSetup(page)
    await setIsReturningUser(page.context())
    await page.goto(SELECTED_ELEMENT_PATH)
    await waitForModelReady(page)
  })

  test('leaves no cut plane checked, and the next pick adds one', async ({page}) => {
    const controlButtonCutPlane = page.getByTestId('control-button-cut-plane')
    const menuCutPlane = page.getByTestId('menu-cut-plane')
    const menuItemPlan = page.getByTestId('menu-item-plan')

    await controlButtonCutPlane.click()
    await menuItemPlan.click()
    await expect(menuCutPlane).toBeHidden()
    await expect.poll(() => new URL(page.url()).hash).toContain('cp:y')

    await page.getByTestId('element-group').getByTitle('Clear').click()
    await expect.poll(() => new URL(page.url()).hash).not.toContain('cp:')

    await controlButtonCutPlane.click()
    await expect(menuItemPlan).toHaveAttribute('aria-checked', 'false')
    // Picking it again adds the plane, rather than toggling off one the
    // store still thought was there.
    await menuItemPlan.click()
    await expect.poll(() => new URL(page.url()).hash).toContain('cp:y')
  })
})
