import '@percy/cypress'
import {
  homepageSetup,
  setIsReturningUser,
} from '../../support/utils'

/**
 * Ensure share button hidden when loading a local model via /v/new.
 */
describe('view 100: Local model share disabled', () => {
  beforeEach(() => {
    homepageSetup()
    setIsReturningUser()
    cy.intercept('GET', '/local.ifc', {fixture: 'index.ifc'}).as('loadModel')
  })

  it('Hides share control for local model', () => {
    cy.visit('/share/v/new/local.ifc')
    cy.get('#viewer-container').get('canvas').should('be.visible')
    cy.wait('@loadModel')
    cy.get('[data-model-ready="true"]').should('exist', {timeout: 1000})
    cy.get('[data-testid="control-button-share"]').should('not.exist')
  })
})
