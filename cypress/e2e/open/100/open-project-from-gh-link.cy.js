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
      cy.get('[data-testid="control-button-search"]').click()
      setupVirtualPathIntercept(
        '/share/v/gh/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc',
        '/Momentum.ifc',
        interceptTag,
      )
      // Note this includes {enter} at end to simulate Enter keypress
      cy.get('[data-testid="textfield-search-query"]')
        .type('https://github.com/Swiss-Property-AG/Momentum-Public/blob/main/Momentum.ifc{enter}')
    })

    // TODO(https://github.com/bldrs-ai/Share/issues/1269): fix and re-enable
    it.skip('Model loads - Screen', () => {
      waitForModelReady(interceptTag)
      cy.percySnapshot()
    })
  })
})
