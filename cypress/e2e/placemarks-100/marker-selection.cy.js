import '@percy/cypress'
import {Raycaster, Vector2, Vector3} from 'three'
import {TITLE_NOTES} from '../../../src/Components/Notes/component'
import {homepageSetup,
   returningUserVisitsHomepageWaitForModel,
   auth0Login,
  } from '../../support/utils'
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
        cy.get('[data-testid="PanelTitle"]').contains(TITLE_NOTES)
        cy.window().then((window) => {
            win = window
        })
        const waitTimeMs = 1000
        // eslint-disable-next-line cypress/no-unnecessary-waiting
        cy.wait(waitTimeMs)
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

        cy.percySnapshot()
      })

      // TODO(https://github.com/bldrs-ai/Share/issues/1269): fix and re-enable
      it.skip('should click a marker link with a camera coordinate in it and the camera should change', () => {
        auth0Login()
        cy.get('[data-testid="list-notes"]')
        .children()
        .eq(5) // Select the 6th child (0-based index)
        .click() // Click the element

        // Intercept the hyperlink click to prevent navigation
        cy.get('a[href*="#m:-18,20.289,-3.92,1,0,0;c:71.225,28.586,-45.341,-33,15,-5.613"]')
        .should('exist') // Ensure the link exists
        .then(($link) => {
          // Attach a click handler to prevent default behavior
          cy.wrap($link).invoke('on', 'click', (event) => {
            event.preventDefault() // Prevent the redirect
          })

          // Now click the hyperlink
          cy.wrap($link).click()
        })

        cy.percySnapshot()
      })
      it('should add a placemark to the scene, and make sure the placemark appends to and exists in the right issue', () => {
        auth0Login()
        cy.get('[data-testid="list-notes"]')
        .children()
        .eq(4) // Select the 5th child (0-based index)
        .click() // Click the element

        cy.get('[placeholder="Leave a comment ..."]')
        .type('test')
        .should('have.value', 'test') // Assert that the textbox contains the test input

        // Select the "Place Mark" button
        cy.get('[data-testid="Place Mark"]')
        .filter(':not(:disabled)') // Select only the enabled "Place Mark" button
        .click() // Click the enabled button


        // Get the canvas element and calculate the click position for placing the marker
        cy.get('[data-testid="cadview-dropzone"]').then(($el) => {
          const canvasRect = $el[0].getBoundingClientRect()
          // eslint-disable-next-line no-mixed-operators
          const screenX = canvasRect.left + canvasRect.width / 2 // X coordinate at the center
          // eslint-disable-next-line no-mixed-operators
          const screenY = canvasRect.top + canvasRect.height / 2 // Y coordinate at the center

          // Dispatch a double-click event at the calculated position
          const event = new MouseEvent('dblclick', {
            bubbles: true,
            cancelable: true,
            clientX: screenX,
            clientY: screenY,
          })
          $el[0].dispatchEvent(event)
        })

        // Verify that the correct text is added to the "Leave a comment" text area
        cy.get('[placeholder="Leave a comment ..."]').should(($textarea) => {
          const value = $textarea.val() // Get the current value of the text area
          expect(value).to.match(/\[placemark\]\(.*#m:.+\)/) // Match the expected format
        })

        cy.percySnapshot()
        })
      })
  })
})
