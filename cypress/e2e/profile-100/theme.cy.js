import '@percy/cypress'
import {
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
  waitForModel,
} from '../../support/utils'


/** {@link https://github.com/bldrs-ai/Share/issues/1070} */
describe('Profile 100: Theme', () => {
  beforeEach(homepageSetup)
  context('Returning user visits homepage', () => {
    beforeEach(returningUserVisitsHomepageWaitForModel)

    it('Day theme active - Screen', () => cy.percySnapshot())

    context('Select ProfileControl > Night theme', () => {
      beforeEach(() => {
        cy.get('[data-testid="control-button-profile"]').click()
        cy.get('[data-testid="change-theme-to-night"]').click()
        waitForModel()
      })

      it('Night theme active - Screen', () => cy.percySnapshot())

      context('Select ProfileControl > Day theme', () => {
        beforeEach(() => {
          cy.get('[data-testid="control-button-profile"]').click()
          cy.get('[data-testid="change-theme-to-day"]').click()
          waitForModel()
        })

        it('Day theme active - Screen', () => cy.percySnapshot())
      })
    })
  })
})
