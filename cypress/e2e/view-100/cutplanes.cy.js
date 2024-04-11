import '@percy/cypress'
import {
  homepageSetup,
  setIsReturningUser,
  visitHomepageWaitForModel,
} from '../../support/utils'


// From https://github.com/bldrs-ai/Share/issues/1106
describe('view 100: Cutplanes', () => {
  beforeEach(homepageSetup)

  context('View model, click CutPlaneControl', () => {
    beforeEach(() => {
      setIsReturningUser()
      visitHomepageWaitForModel()
      cy.get('[data-testid="control-button-section"]').click()
    })

    it('Section menu visible', () => {
      cy.get('[data-testid="menu-cut-plane"]').should('exist')
      cy.percySnapshot()
    })

    context('Select all cut-planes', () => {
      beforeEach(() => {
        // Already open
        cy.get('[data-testid="menu-item-plan"]').click()

        cy.get('[data-testid="control-button-section"]').click()
        cy.get('[data-testid="menu-item-section"]').click()

        cy.get('[data-testid="control-button-section"]').click()
        cy.get('[data-testid="menu-item-elevation"]').click()
      })

      it('Plan cut-planes added to model', () => {
        cy.get('body').find('[data-testid="menu-cut-plane"]').should('not.exist')
        cy.percySnapshot()
      })
    })
  })
})
