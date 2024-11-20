import '@percy/cypress'
import {homepageSetup, returningUserVisitsHomepageWaitForModel} from '../../support/utils'


/** {@link https://github.com/bldrs-ai/Share/issues/1054} */
describe('Placemarks 100: Not visible when notes is not open', () => {
  beforeEach(homepageSetup)
  context('Returning user visits homepage', () => {
    beforeEach(returningUserVisitsHomepageWaitForModel)
    it('MarkerControl should not exist', () => {
        cy.get('[data-testid="markerControl"]').should('not.exist')
    })

    context('Open Notes and MarkerControl should exist', () => {
        let win
      beforeEach(() => {
        cy.get('[data-testid="control-button-notes"]').click()

        cy.get('[data-testid="list-notes"]')
        cy.get('[data-testid="panelTitle"]').contains('NOTES')

        cy.window().then((window) => {
            win = window
        })
        // eslint-disable-next-line cypress/no-unnecessary-waiting, no-magic-numbers
        cy.wait(1500)
    })
      it('MarkerControl should exist', () => {
        // Access the scene objects
        const markers = win.markerScene.markerObjects

        // Assert that markers exist
        expect(markers.length).to.eq(2)

        // Check visibility of markers
        markers.forEach((marker) => {
        // eslint-disable-next-line no-unused-expressions
          expect(marker.userData.id).to.exist
        })
      })
    })
  })
})
