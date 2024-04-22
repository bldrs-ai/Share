import '@percy/cypress'
import {
  homepageSetup,
  setIsReturningUser,
  visitHomepageWaitForModel,
} from '../../support/utils'
import {
  setupInterceptForGhModel,
  waitForModelReady,
} from '../../support/models'


/** {@link https://github.com/bldrs-ai/Share/issues/765} */
describe('Open 100: Open Project From GitHub Link', () => {
  beforeEach(homepageSetup)
  context('Returning user visits homepage, enters Model URL into search', () => {
    const interceptTag = 'ghModelLoad'
    beforeEach(() => {
      setIsReturningUser()
      visitHomepageWaitForModel()
      cy.get('[data-testid="control-button-search"]').click()
      setupInterceptForGhModel(interceptTag)
    })

    it('Model loads - Screen', () => {
      // Note this includes {enter} at end to simulate Enter keypress
      cy.get('[data-testid="textfield-search-query"]')
        .type('https://github.com/Swiss-Property-AG/Momentum-Public/blob/main/Momentum.ifc{enter}')
      waitForModelReady(interceptTag)
      cy.percySnapshot()
    })
  })
})
