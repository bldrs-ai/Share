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
      // TODO(pablo): can't figure out how to get intercept for deep path, but this works
      cy.visit('/share/v/p/index.ifc/621')
      waitForModelReady('bounceEltSelect')
    })

    it('Item highlighted in tree and scene - Screen', () => {
      cy.percySnapshot()
    })
  })
})
