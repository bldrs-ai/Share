import '@percy/cypress'
import {
    setupVirtualPathIntercept,
    waitForModelReady,
  } from '../../../support/models'
import {
  homepageSetup,
  setIsReturningUser,
  visitHomepageWaitForModel,
} from '../../../support/utils'


describe('Search 100: GitHub Link', () => {
  const interceptTag = 'ghModelLoad'

  beforeEach(() => {
    homepageSetup()
    setIsReturningUser()
  })

  context('Returning user visits homepage, Open Search > Enters GitHub link to Momentum', () => {
    beforeEach(() => {
      visitHomepageWaitForModel()
      setupVirtualPathIntercept(
        '/share/v/gh/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc',
        '/Momentum.ifc',
        interceptTag,
      )
      cy.get('[data-testid="control-button-search"]').click()
      cy.get('[data-testid="textfield-search-query"]')
      .type('https://github.com/Swiss-Property-AG/Momentum-Public/blob/main/Momentum.ifc{enter}')
    })

    it('Momentum Loads Successfully - Screen', () => {
        waitForModelReady(interceptTag)
        cy.percySnapshot()
      })
  })
})
