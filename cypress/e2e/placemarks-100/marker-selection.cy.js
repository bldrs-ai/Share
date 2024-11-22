import '@percy/cypress'
import {Raycaster, Vector2, Vector3} from 'three'
import {homepageSetup, returningUserVisitsHomepageWaitForModel} from '../../support/utils'
import {MOCK_MARKERS} from '../../../src/Components/Markers/Marker.fixture'


/** {@link https://github.com/bldrs-ai/Share/issues/1054} */
describe('Placemarks 100: Not visible when notes is not open', () => {
  beforeEach(homepageSetup)
  context('Returning user visits homepage', () => {
    beforeEach(returningUserVisitsHomepageWaitForModel)

    context('Select a marker', () => {
        let win
      beforeEach(() => {
        cy.get('[data-testid="control-button-notes"]').click()
        cy.get('[data-testid="list-notes"]')
        cy.get('[data-testid="panelTitle"]').contains('NOTES')

        cy.window().then((window) => {
            win = window
        })
        // eslint-disable-next-line cypress/no-unnecessary-waiting, no-magic-numbers
        cy.wait(1000)
    })
      it('should select a marker and url hash should change', () => {
        const {markerObjects, camera, domElement} = win.markerScene

        // Assert that markers exist
        expect(markerObjects.length).to.eq(2)

        // Get the first marker's position
        const markerCoordinates = MOCK_MARKERS[0].coordinates
        const markerPosition = new Vector3(markerCoordinates[0], markerCoordinates[1], markerCoordinates[2])

        // Project marker position to NDC
        const ndc = markerPosition.project(camera)

        // Calculate the screen position of the marker
        const canvasRect = domElement.getBoundingClientRect()
        // eslint-disable-next-line no-mixed-operators
        const screenX = ((ndc.x + 1) / 2) * canvasRect.width + canvasRect.left
        // eslint-disable-next-line no-mixed-operators
        const screenY = ((1 - ndc.y) / 2) * canvasRect.height + canvasRect.top


        // Perform raycasting after updating the pointer
        const raycaster = new Raycaster()
        const pointer = new Vector2()
        // eslint-disable-next-line no-mixed-operators
        pointer.x = ((screenX - canvasRect.left) / canvasRect.width) * 2 - 1
        // eslint-disable-next-line no-mixed-operators
        pointer.y = -((screenY - canvasRect.top) / canvasRect.height) * 2 + 1

        raycaster.setFromCamera(pointer, camera)
        const intersects = raycaster.intersectObjects(markerObjects)

        // Assert that the raycaster intersects with the marker
        expect(intersects.length).to.be.greaterThan(0)

        cy.get('[data-testid="cadview-dropzone"]').then(($el) => {
            const event = new MouseEvent('mousedown', {
              bubbles: true,
              cancelable: true,
              clientX: screenX,
              clientY: screenY,
            })
            $el[0].dispatchEvent(event)
          })

        // Assert that the URL hash contains marker coordinates
        const expectedHash = `#m:${markerCoordinates[0]},${markerCoordinates[1]},${markerCoordinates[2]}`
        cy.url().should('include', expectedHash)
      })
    })
  })
})
