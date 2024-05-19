import '@percy/cypress'
import {
  homepageSetup,
  setIsReturningUser,
  visitHomepageWaitForModel,
  waitForModel,
} from '../../support/utils'
import {
  waitForModelReady,
} from '../../support/models'


/** {@link https://github.com/bldrs-ai/Share/issues/1106} */
describe('view 100: Cutplanes', () => {
  beforeEach(() => {
    homepageSetup()
    setIsReturningUser()
  })

  context('View model', () => {
    beforeEach(visitHomepageWaitForModel)

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
      cy.visit('/share/v/p/index.ifc#cp:y=17.077,x=-25.551,z=5.741;c:-133.022,131.828,161.85,-38.078,22.64,-2.314')
      waitForModel()
    })

    it('Shows just vertical bar of b', () => {
      cy.percySnapshot()
    })
  })

  context('All hidable controls visible', () => {
    beforeEach(() => {
      const twoLevelSelect = 'twoLevelSelect'
      cy.intercept('GET', '/share/v/p/index.ifc/88/546', {fixture: '404.html'}).as(twoLevelSelect)
      cy.visit('/share/v/p/index.ifc/88/546#cp:y=17.077,x=-25.551,z=5.741;i:;n:;p:;s:')
      waitForModelReady(twoLevelSelect)
      // cy.get('[data-testid="control-button-cut-plane"]').click()
      cy.get('[data-testid="Clear"]').click()
    })

    it('Clearing cut-planes leaves other page state alone - Screen', () => {
      cy.findByTestId('textfield-search-query').should('be.visible')
      cy.findByTestId('panel-navigation').should('be.visible')
      cy.findByTestId('side-drawer-panel-notes').should('be.visible')
      cy.findByTestId('side-drawer-panel-properties').should('be.visible')
      cy.percySnapshot()
    })
  })
})
