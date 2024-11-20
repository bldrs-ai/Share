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
      beforeEach(() => cy.get('[data-testid="control-button-notes"]').click())
      it('MarkerControl should exist', () => {
        cy.get('[data-testid="list-notes"]')
        cy.get('[data-testid="panelTitle"]').contains('NOTES')
        // Access the scene objects
        cy.window().then((win) => {
        const markers = win.markerScene.markerObjects

        // Assert that markers exist
        expect(markers.length).to.eq(2)

        // Check visibility of markers
        markers.forEach((marker) => {
        cy.log('test')
        // eslint-disable-next-line no-unused-expressions
          expect(marker.userData.id).to.exist
        })
      })
      })
    })
  })
})
