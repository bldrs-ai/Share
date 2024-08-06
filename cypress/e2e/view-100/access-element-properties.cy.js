import '@percy/cypress'
import {
  homepageSetup,
  setIsReturningUser,
} from '../../support/utils'
import {
  waitForModelReady,
} from '../../support/models'


/** {@link https://github.com/bldrs-ai/Share/issues/1242} */
describe('View 100: Access elements property', () => {
  beforeEach(() => {
    homepageSetup()
    setIsReturningUser()
  })

  context('User visits permalink to selected element and clicks properties control', () => {
    const interceptTag = 'twoLevelSelect'
    beforeEach(() => {
      cy.intercept('GET', '/share/v/p/index.ifc/81/621', {fixture: '404.html'}).as('twoLevelSelect')
      cy.visit('/share/v/p/index.ifc/81/621')
      waitForModelReady(interceptTag)
      cy.get('[data-testid="control-button-properties"]').click()
    })

    it('Side drawer containing properties shall be visible', () => {
      cy.get('[data-testid="control-button-properties"]').should('be.visible')
      cy.get('[data-testid="panelTitle"]').contains('PROPERTIES')
      cy.percySnapshot()
    })
  })
})
