import '@percy/cypress'
import {waitForModelReady} from '../../support/models'
import {
  homepageSetup,
  setIsReturningUser,
  visitHomepageWaitForModel,
} from '../../support/utils'


/** {@link https://github.com/bldrs-ai/Share/issues/1077} */
describe('create-100: Imagine', () => {
  beforeEach(() => {
    homepageSetup()
    setIsReturningUser()
  })

  context('Returning user visits hompage, clicks ImagineControlButton', () => {
    beforeEach(() => {
      visitHomepageWaitForModel()
      cy.findByTestId('control-button-rendering').click()
    })

    it('Shows screenshot - Screen', () => {
      cy.title().should('eq', 'Imagine')
      cy.percySnapshot()
    })

    context('Description entered', () => {
      const HTTP_OK = 200
      before(() => {
        cy.readFile('cypress/fixtures/candy-cane-bldrs.png', 'base64').then((imageData) => {
          cy.intercept('POST', '**/generate', (req) => {
            req.reply({
              statusCode: HTTP_OK,
              body: [{
                // Already base64 encoded
                img: imageData,
              }],
            })
          }).as('renderedReply')
        })
      })

      beforeEach(() => {
        cy.get('[data-testid="text-field-render-description"]').type('candy cane')
        cy.findByText('Create').click()
      })

      it('Shows candy cane render - Screen', () => {
        cy.wait('@renderedReply').its('response.statusCode').should('eq', HTTP_OK)
        cy.get('[data-testid="img-rendered"]')
        cy.percySnapshot()
      })

      // For bug https://github.com/bldrs-ai/Share/issues/1068
      context('Reopen dialog', () => {
        beforeEach(() => {
          cy.get('[data-testid="button-close-dialog"]').click()
          cy.get('[data-testid="control-button-rendering"]').click()
        })

        it('Shows screenshot - Screen', () => {
          cy.title().should('eq', 'Imagine')
          cy.percySnapshot()
        })
      })
    })
  })

  context('Returning user visits imagine permalink', () => {
    beforeEach(() => {
      // TODO(pablo): tried having a nice camera, but still can't detect animation at rest yet
      cy.visit('/share/v/p/index.ifc#imagine:')
      waitForModelReady('bounce')
    })

    it('Imagine dialog and model screenshot visible - Screen', () => {
      cy.percySnapshot()
    })
  })
})
