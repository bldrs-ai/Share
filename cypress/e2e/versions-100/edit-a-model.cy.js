import '@percy/cypress'
import {
  auth0Login,
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
} from '../../support/utils'
import {
  setupVirtualPathIntercept,
  waitForModelReady,
} from '../../support/models'


/** {@link https://github.com/bldrs-ai/Share/issues/1160}*/
describe('Versions 100: Edit a specific version', () => {
  beforeEach(homepageSetup)

  context('Returning user visits homepage, logs in', () => {
    const overwriteVersionInterceptTag = 'ghNewModelLoad'
    beforeEach(() => {
      returningUserVisitsHomepageWaitForModel()
      auth0Login()
      setupVirtualPathIntercept(
        '/share/v/gh/cypresstester/test-repo/main/window.ifc',
        '/Momentum.ifc',
        overwriteVersionInterceptTag)
    })

    // TODO(https://github.com/bldrs-ai/Share/issues/1269): fix and re-enable
    // Assumes this flow's file exists cypress/e2e/open/100/open-model-from-gh-ui.cy.js
    it.skip('Save index.ifc to new name, that overwrites existing other file', () => {
      cy.findByTitle('Save', {timeout: 5000}).should('exist').click({force: true})
      cy.findByLabelText('Organization', {timeout: 5000}).click()
      cy.contains('@cypresstester').click()
      cy.findByLabelText('Repository', {timeout: 5000}).eq(0).click()
      cy.contains('test-repo').click()
      cy.findByLabelText('Enter file name').click().type('window.ifc')
      cy.contains('button', 'Save model').click()
      waitForModelReady(overwriteVersionInterceptTag)
      cy.percySnapshot()
    })
  })
})
