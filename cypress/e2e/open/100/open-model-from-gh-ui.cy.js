import '@percy/cypress'
import {
  auth0Login,
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
} from '../../../support/utils'
import {
    setupVirtualPathIntercept,
    waitForModelReady,
  } from '../../../support/models'


/** {@link https://github.com/bldrs-ai/Share/issues/1159}*/
describe('Open 100: Open model from GH via UI', () => {
  beforeEach(homepageSetup)
  context('Returning user visits homepage, logs in', () => {
    beforeEach(() => {
      returningUserVisitsHomepageWaitForModel()
      auth0Login()
      // set up initial index.ifc load
      setupVirtualPathIntercept(
        '/share/v/gh/cypresstester/test-repo/main/window.ifc',
        '/index.ifc',
        interceptTag)
    })

    const interceptTag = 'ghOpenModelLoad'
    it('Opens a model from Github via the UI', () => {
      cy.get('[data-testid="control-button-open"]').click()
      cy.findByText('Projects').click()
      cy.findByLabelText('Organization', {timeout: 5000}).click()
      cy.contains('@cypresstester').click()
      cy.findByLabelText('Repository', {timeout: 5000}).eq(0).click()
      cy.contains('test-repo').click()
      cy.findByLabelText('File', {timeout: 5000}).eq(0).click()
      cy.contains('window.ifc').click()
      cy.get('[data-testid="openFromGithub"]').click()
      waitForModelReady(interceptTag)
      cy.percySnapshot()
    })
  })
})
