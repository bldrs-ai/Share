import '@percy/cypress'
import {homepageSetup, returningUserVisitsHomepageWaitForModel} from '../../support/utils'
import {TITLE_APPS} from '../../../src/Components/Apps/component'
import {ID_RESIZE_HANDLE_X} from '../../../src/Components/SideDrawer/HorizonResizerButton'

/** {@link https://github.com/bldrs-ai/Share/issues/1282} */
describe('AppsSideDrawer', () => {
  beforeEach(homepageSetup)
  context('Returning user visits homepage', () => {
    beforeEach(returningUserVisitsHomepageWaitForModel)

    it('Apps button should be present', () => {
      cy.findByRole('button', {name: TITLE_APPS}).should('exist')
      cy.findByRole('heading', {name: TITLE_APPS}).should('not.exist')
    })

    context('User clicks Apps button', () => {
      beforeEach(() => cy.get('[data-testid="control-button-apps"]').click())

      it('should show apps drawer', () => {
        cy.findByRole('heading', {name: TITLE_APPS}).should('exist')
      })

      it('should expand the apps window full screen on double click', () => {
        // Simulate a double click on the HorizonResizerButton
        cy.get(`[data-testid="${ID_RESIZE_HANDLE_X}"]`).dblclick({force: true})

        // Verify the apps drawer is full screen
        cy.get('[data-testid="AppsDrawer"]').should('have.css', 'width').and('eq', '1000px')

        cy.percySnapshot()
      })

      // TODO(pablo):
      /* context.skip('User selects SampleApp', () => {
        beforeEach(() => cy.findByRole('heading', {name: TITLE_APP}).click())
        it('should show app drawer', () => {
          cy.findByRole('heading', {name: TITLE_APP}).should('exist')
        })
      })*/
    })
  })
})
