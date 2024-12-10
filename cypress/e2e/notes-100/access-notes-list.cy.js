import '@percy/cypress'
import {TITLE_NOTES} from '../../../src/Components/Notes/component'
import {homepageSetup, returningUserVisitsHomepageWaitForModel, auth0Login} from '../../support/utils'


/** {@link https://github.com/bldrs-ai/Share/issues/1054} */
describe('Notes 100: Access notes list', () => {
  beforeEach(homepageSetup)
  context('Returning user visits homepage', () => {
    beforeEach(returningUserVisitsHomepageWaitForModel)
    context('Open Notes', () => {
      beforeEach(() => cy.get('[data-testid="control-button-notes"]').click())
      it('Notes visible - Screen', () => {
        cy.get('[data-testid="list-notes"]')
        cy.get(`[data-testid="PanelTitle-${TITLE_NOTES}"]`).contains(TITLE_NOTES)
      })
    })
    context('Open Notes - authenticated', () => {
      beforeEach(() => {
        auth0Login()
        cy.get('[data-testid="control-button-notes"]').click()
      })
      it('Notes visible - Screen', () => {
        cy.get('[data-testid="list-notes"]')
        cy.get(`[data-testid="PanelTitle-${TITLE_NOTES}"]`).contains(TITLE_NOTES)
      })
    })
  })
})
