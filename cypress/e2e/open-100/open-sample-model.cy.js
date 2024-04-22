import '@percy/cypress'
import {
  homepageSetup,
  setIsReturningUser,
  visitHomepageWaitForModel,
} from '../../support/utils'
import {
  setupInterceptForGhModel,
  waitForModelReady,
} from '../../support/models'


/** {@link https://github.com/bldrs-ai/Share/issues/757} */
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
      const interceptTag = 'ghModelLoad'
      beforeEach(() => {
        setupInterceptForGhModel(interceptTag)
        cy.findByText('Momentum').click()
      })

      it('Project loads - Screen', () => {
        waitForModelReady(interceptTag)
        cy.percySnapshot()
      })
    })
  })
})
