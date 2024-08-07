import '@percy/cypress'
import {
  homepageSetup,
  setIsReturningUser,
  visitHomepageWaitForModel,
} from '../../../support/utils'
import {
  setupVirtualPathIntercept,
  waitForModelReady,
} from '../../../support/models'


/** {@link https://github.com/bldrs-ai/Share/issues/765} */
describe('Open 100: Open Project From GitHub Link', () => {
  beforeEach(homepageSetup)
  context('Returning user visits homepage, enters Model URL into search', () => {
    const interceptTag = 'ghModelLoad'
    beforeEach(() => {
      setIsReturningUser()
      visitHomepageWaitForModel()
      setupVirtualPathIntercept(
        '/share/v/gh/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc',
        '/Momentum.ifc',
        interceptTag,
      )
    })

    it('Use search component to enter model URL - Model loads - Screen', () => {
      cy.get('[data-testid="control-button-search"]').click()
      // Note this includes {enter} at end to simulate Enter keypress
      cy.get('[data-testid="textfield-search-query"]')
      .type('https://github.com/Swiss-Property-AG/Momentum-Public/blob/main/Momentum.ifc{enter}')
      waitForModelReady(interceptTag)
      cy.percySnapshot()
    })

    it('Use open dialog to enter model URL - Model loads', () => {
      cy.get('[data-testid="control-button-open"]').click()
      cy.get('[data-testid="tab-github"]').click()
      cy.get('[data-testid="textfield-search-query"]')
      .type('https://github.com/Swiss-Property-AG/Momentum-Public/blob/main/Momentum.ifc')
      cy.get('[data-testid="button-search-activate"]').click()
      waitForModelReady(interceptTag)
    })
  })
})
