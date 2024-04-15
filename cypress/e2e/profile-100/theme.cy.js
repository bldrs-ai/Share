import '@percy/cypress'
import {
  homepageSetup,
  setIsReturningUser,
  visitHomepageWaitForModel,
} from '../../support/utils'


/** {@link https://github.com/bldrs-ai/Share/issues/1070} */
describe('Profile 100: Theme', () => {
  context('Returning user visits homepage', () => {
    beforeEach(() => {
      homepageSetup()
      setIsReturningUser()
      visitHomepageWaitForModel()
    })

    it('Day theme active - Screen', () => cy.percySnapshot())

    context('Select ProfileControl > Night theme', () => {
      beforeEach(() => {
        cy.get('[data-testid="control-button-profile"]').click()
        cy.get('[data-testid="change-theme-to-night"]').click()
      })

      it('Night theme active - Screen', () => cy.percySnapshot())

      context('Select ProfileControl > Day theme', () => {
        beforeEach(() => {
          cy.get('[data-testid="control-button-profile"]').click()
          cy.get('[data-testid="change-theme-to-day"]').click()
        })

        it('Day theme active - Screen', () => cy.percySnapshot())
      })
    })
  })
})
