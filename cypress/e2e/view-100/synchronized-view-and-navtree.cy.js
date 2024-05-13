import '@percy/cypress'
import {
  homepageSetup,
  setIsReturningUser,
  visitHomepageWaitForModel,
} from '../../support/utils'
import {
  waitForModelReady,
} from '../../support/models'


/** {@link https://github.com/bldrs-ai/Share/issues/1046} */
describe('View 100: Synchronized View and NavTree', () => {
  beforeEach(() => {
    homepageSetup()
    setIsReturningUser()
  })

  context('User visits homepage, Open NavTree > select item', () => {
    beforeEach(() => {
      visitHomepageWaitForModel()
      cy.get('[data-testid="control-button-navigation"]').click()
      cy.findByText('Bldrs').should('be.visible').click()
      cy.findByText('Build').should('be.visible').click()
      cy.findByText('Every').should('be.visible').click()
      cy.findByText('Thing').should('be.visible').click()
      cy.findAllByText('Together').eq(0).should('be.visible').click()
      cy.findAllByText('Together').eq(1).should('be.visible').click()
      cy.findAllByText('Together').eq(2).should('be.visible').click()
      cy.findAllByText('Together').eq(3).should('be.visible').click()
      cy.findAllByText('Together').eq(4).should('be.visible').click()
      cy.findAllByText('Together').eq(5).should('be.visible').click()
      cy.findAllByText('Together').eq(6).should('be.visible').click()
    })

    it('Item highlighted in tree and scene - Screen', () => {
      cy.percySnapshot()
    })
  })

  context('Visits permalink to selected element', () => {
    beforeEach(() => {
      // TODO(pablo): root id selection doesn't work after search state working.  Also move this to a helper
      cy.intercept('GET', '/share/v/p/index.ifc/81/621', {fixture: '404.html'}).as('twoLevelSelect')
      cy.visit('/share/v/p/index.ifc/81/621')
      waitForModelReady('twoLevelSelect')
    })

    it('Item highlighted in tree and scene - Screen', () => {
      cy.percySnapshot()
    })
  })
})
