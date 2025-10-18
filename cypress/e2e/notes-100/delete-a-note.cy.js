import '@percy/cypress'
import {homepageSetup, returningUserVisitsHomepageWaitForModel, auth0Login} from '../../support/utils'

/** {@link https://github.com/bldrs-ai/Share/issues/1058} */
describe('edit a note', () => {
  context('User visits homepage in the logged-in state', () => {
    beforeEach(() => {
      homepageSetup()
      returningUserVisitsHomepageWaitForModel()
      cy.visit('/share/v/p/index.ifc#c:-133.022,131.828,161.85,-38.078,22.64,-2.314')
      auth0Login()
    })
    it('Correct project to be loaded into the viewport and side drawer to be open - Screen', () => {
      cy.get('[data-testid="control-button-notes"]').click()
      cy.get(`:nth-child(1) > [data-testid="note-card"] [data-testid="note-menu-button"]`).click()
      cy.percySnapshot()
      cy.get('.MuiList-root > [tabindex="-1"]').click()
      // ToDo: the final check with the deleted note disappearing from the list
      // will be implemented when Pablo finished the github store mock
    })
  })
})
