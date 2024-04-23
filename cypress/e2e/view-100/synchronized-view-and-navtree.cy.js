import '@percy/cypress'
import {
  homepageSetup,
  setIsReturningUser,
  visitHomepageWaitForModel,
  waitForModel,
} from '../../support/utils'


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
      cy.findAllByText('Together').then((elt) => elt[0]).should('be.visible').click()
      cy.findAllByText('Together').then((elt) => elt[1]).should('be.visible').click()
      cy.findAllByText('Together').then((elt) => elt[2]).should('be.visible').click()
      cy.findAllByText('Together').then((elt) => elt[3]).should('be.visible').click()
      cy.findAllByText('Together').then((elt) => elt[4]).should('be.visible').click()
      cy.findAllByText('Together').then((elt) => elt[5]).should('be.visible').click()
      cy.findAllByText('Together').then((elt) => elt[6]).should('be.visible').click()
      cy.findAllByText('Together').then((elt) => elt[7]).should('be.visible').click()
    })

    it('Item highlighted in tree and scene - Screen', () => {
      cy.percySnapshot()
    })
  })

  context.only('Visits permalink to selected element', () => {
    beforeEach(() => {
      // TODO(pablo): can't figure out how to get intercept for deep path, but this works
      cy.visit('/share/v/p/index.ifc/621')
      waitForModel()
    })

    it('Item highlighted in tree and scene - Screen', () => {
      cy.percySnapshot()
    })
  })
})
