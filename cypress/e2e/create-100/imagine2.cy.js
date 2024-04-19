import '@percy/cypress'


/** @see https://github.com/bldrs-ai/Share/issues/1077 */
describe('create-100: Imagine', () => {
  it('Shows screenshot - Screen', () => {
    cy.setCookie('isFirstTime', '1')
    cy.visit('/')
    cy.url().then(() => {
      cy.findByTestId('control-button-rendering').click()
      cy.title().should('eq', 'Imagine')
    })
  })
})
