import {homepageSetup, returningUserVisitsHomepageWaitForModel} from '../../support/utils'
import {TITLE_APP, TITLE_APPS} from '../../../src/Components/Apps/component'


/** {@link https://github.com/bldrs-ai/Share/issues/1282} */
describe('AppsSideDrawer', () => {
  beforeEach(homepageSetup)
  context('Returning user visits homepage', () => {
    beforeEach(returningUserVisitsHomepageWaitForModel)
    it('Apps button should be present', () => {
      cy.findByRole('button', {name: TITLE_APPS}).should('exist')
      cy.findByRole('heading', {name: TITLE_APPS}).should('not.exist')
    })
    // TODO(pablo):
    context.skip('User clicks Apps button', () => {
      beforeEach(() => cy.get('[data-testid="control-button-apps"]').click())
      it('should show apps drawer', () => {
        cy.findByRole('heading', {name: TITLE_APPS}).should('exist')
      })
      context('User selects SampleApp', () => {
        beforeEach(() => cy.findByRole('heading', {name: TITLE_APP}).click())
        it('should show app drawer', () => {
          cy.findByRole('heading', {name: TITLE_APP}).should('exist')
        })
      })
    })
  })
})
