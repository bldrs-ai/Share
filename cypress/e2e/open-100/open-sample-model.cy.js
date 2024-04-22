import '@percy/cypress'
import {
  homepageSetup,
  setIsReturningUser,
  visitHomepageWaitForModel,
} from '../../support/utils'


describe('Open 100: Open Sample Model', () => {
  beforeEach(homepageSetup)
  context('Returning user visits homepage, select OpenModelControl > Sample Models', () => {
    beforeEach(() => {
      setIsReturningUser()
      visitHomepageWaitForModel()
      cy.get('[data-testid="control-button-open"]').click()
      cy.get('[data-testid="textfield-sample-projects"]').click()
    })

    it('Sample project list appears, including Momentum etc. - Screen', () => {
      cy.percySnapshot()
    })

    context('Choose one of the projects from the list', () => {
      beforeEach(() => {
        cy.intercept(
          'GET',
          'https://rawgit.bldrs.dev.msw/r/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc',
          {fixture: '/Momentum.ifc'},
        )
          .as('loadMomentum')
        cy.findByText('Momentum').click()
      })

      it('Project loads - Screen', () => {
        cy.wait('@loadMomentum')
        // TODO(pablo): same as index.ifc load
        cy.get('[data-model-ready="true"]').should('exist', {timeout: 1000})
        const animWaitTimeMs = 1000
        // eslint-disable-next-line cypress/no-unnecessary-waiting
        cy.wait(animWaitTimeMs)
        cy.percySnapshot()
      })
    })
  })
})
