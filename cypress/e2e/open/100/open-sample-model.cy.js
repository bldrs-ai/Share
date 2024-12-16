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


/** {@link https://github.com/bldrs-ai/Share/issues/757} */
describe('Open 100: Open Sample Model', () => {
  context('Returning user visits homepage', () => {
    beforeEach(() => {
      homepageSetup()
      setIsReturningUser()
      visitHomepageWaitForModel()
    })

    context('Select OpenModelControl > Sample Models', () => {
      beforeEach(() => {
        cy.get('[data-testid="control-button-open"]').click()
        cy.get('[data-testid="tab-samples"]').click()
      })

      it('Sample project list appears, including Momentum etc. - Screen', () => {
        cy.percySnapshot()
      })

      context('Choose one of the projects from the list', () => {
        beforeEach(() => {
          const interceptTag = 'ghModelLoad'
          setupVirtualPathIntercept(
            '/share/v/gh/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc',
            '/Momentum.ifc',
            interceptTag,
          )
          cy.findByText('Momentum').click()
          waitForModelReady(interceptTag)
        })

        it('Project loads - Screen', () => {
          cy.percySnapshot()
        })
      })
    })

    context('Open up all persistent controls', () => {
      beforeEach(() => {
        // Select element, opens nav
        const interceptEltSelectTag = 'twoLevelSelect'
        cy.intercept('GET', '/share/v/p/index.ifc/81/621', {fixture: '404.html'}).as(interceptEltSelectTag)
        cy.visit('/share/v/p/index.ifc/81/621')
        waitForModelReady(interceptEltSelectTag)

        // Open properties
        cy.get('[data-testid="control-button-properties"]').click()

        // Open notes
        cy.get('[data-testid="control-button-notes"]').click()

        // Open search
        cy.get('[data-testid="control-button-search"]').click()

        // Add a cutplane
        cy.get('[data-testid="control-button-cut-plane"]').click()
        cy.get('[data-testid="menu-cut-plane"]').should('exist')
        cy.get('[data-testid="menu-item-plan"]').click()

        // Select a sample project
        const interceptModelLoadTag = 'ghModelLoad'
        setupVirtualPathIntercept(
          '/share/v/gh/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc',
          '/Momentum.ifc',
          interceptModelLoadTag,
        )
        cy.get('[data-testid="control-button-open"]').click()
        cy.get('[data-testid="tab-samples"]').click()
        cy.findByText('Momentum').click()
        waitForModelReady(interceptModelLoadTag)
      })

      it('Project loads, all controls reset - Screen', () => {
        cy.percySnapshot()
      })
    })
  })
})
