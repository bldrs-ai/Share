import '@percy/cypress'
import {
  homepageSetup,
  setIsReturningUser,
  visitHomepageWaitForModel,
  waitForModel,
} from '../../support/utils'


// From https://github.com/bldrs-ai/Share/issues/1106
describe('view 100: Cutplanes', () => {
  beforeEach(homepageSetup)

  context('View model', () => {
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


  context('View cut-plane permalink', () => {
    beforeEach(() => {
      setIsReturningUser()
      cy.visit('/share/v/p/index.ifc#cp:y=17.077,x=-25.551,z=5.741;c:-133.022,131.828,161.85,-38.078,22.64,-2.314')
      waitForModel()
    })

    it('Shows just vertical bar of b', () => {
      cy.percySnapshot()
    })
  })
})
