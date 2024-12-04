import '@percy/cypress'
import {LABEL_GITHUB} from '../../../../src/Components/Open/component'
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
describe('Open 100: Open model dialog', () => {
  beforeEach(homepageSetup)
  context('First time user visits homepage not logged in', () => {
    beforeEach(() => {
      returningUserVisitsHomepageWaitForModel()
        cy.get('[data-testid="control-button-open"]').click()
    })

    it('Sample tab to be selected and Momentum sample model chip to be visible', () => {
      cy.get('[data-testid="tab-samples"]').click()
      cy.get(':nth-child(1) > [data-testid="sample-model-chip"] > .MuiChip-label').contains('Momentum')
      cy.percySnapshot()
    })
    it('Open button is visible', () => {
      cy.get('[data-testid="tab-local"]').click()
      cy.get('[data-testid="button_open_file"]').contains('Browse files...')
      cy.percySnapshot()
    })
  })
  context('Returning user visits homepage logged in', () => {
    beforeEach(() => {
      returningUserVisitsHomepageWaitForModel()
      setupVirtualPathIntercept(
        '/share/v/gh/cypresstester/test-repo/main/window.ifc',
        '/index.ifc',
        interceptTag)
      auth0Login()
      cy.get('[data-testid="control-button-open"]').click()
    })
    it('GitHub controls are visible', () => {
      cy.get('[data-testid="tab-github"]').click()
      cy.percySnapshot()
    })
    const interceptTag = 'ghOpenModelLoad'
    it('Choose the path to the model on GitHub -> model is loaded into the scene', () => {
      cy.get('[data-testid="tab-github"]').click()
      cy.findByText(LABEL_GITHUB).click()
      cy.findByLabelText('Organization', {timeout: 5000}).click()
      cy.contains('@cypresstester').click()
      cy.findByLabelText('Repository', {timeout: 5000}).eq(0).click()
      cy.contains('test-repo').click()
      cy.findByLabelText('File', {timeout: 5000}).eq(0).click()
      cy.contains('window.ifc').click()
      cy.get('[data-testid="button-openfromgithub"]').click()
      waitForModelReady(interceptTag)
      cy.percySnapshot()
    })
})
})
