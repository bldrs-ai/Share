import '@percy/cypress'
import {
  homepageSetup,
  setIsReturningUser,
  visitHomepageWaitForModel,
} from '../../support/utils'


// From https://github.com/bldrs-ai/Share/issues/1106
describe('view 100: Cutplanes', () => {
  beforeEach(homepageSetup)

  context.skip('View model', () => {
    beforeEach(() => {
      setIsReturningUser()
      visitHomepageWaitForModel()
    })

    context(('Click CutPlaneControl'), () => {
      beforeEach(() => cy.get('[data-testid="control-button-cut-plane"]').click())

      it('Section menu visible', () => {
        cy.get('[data-testid="menu-cut-plane"]').should('exist')
        cy.percySnapshot()
      })

      context('Select all cut-planes', () => {
        beforeEach(() => {
          // Already open
          cy.get('[data-testid="menu-item-plan"]').click()

          cy.get('[data-testid="control-button-cut-plane"]').click()
          cy.get('[data-testid="menu-item-section"]').click()

          cy.get('[data-testid="control-button-cut-plane"]').click()
          cy.get('[data-testid="menu-item-elevation"]').click()
        })

        it('All cut-planes added to model', () => {
          cy.get('body').find('[data-testid="menu-cut-plane"]').should('not.exist')
          cy.percySnapshot()
        })

        context('Clear all cut-planes', () => {
          beforeEach(() => {
            cy.get('[data-testid="control-button-cut-plane"]').click()
            cy.get('[data-testid="menu-item-clear-all"]').click()
          })

          it('No cutplanes visible', () => {
            cy.percySnapshot()
          })
        })
      })
    })
  })
})
