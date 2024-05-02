import '@percy/cypress'
import {
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
} from '../../support/utils'

/** {@link https://github.com/bldrs-ai/Share/issues/1059} */
describe('Notes 100: Create a note', () => {
  beforeEach(homepageSetup)
  context('Returning user visits homepage in a logged in state', () => {
    beforeEach(returningUserVisitsHomepageWaitForModel)
    context('Open Notes', () => {
      beforeEach(() => {
        cy.get('[data-testid="control-button-notes"]').click()
      })
      it('Notes list switched to display only create note card', () => {
        cy.get('.MuiCardHeader-title').contains('issueTitle_4')
      })
    })
  })
})
