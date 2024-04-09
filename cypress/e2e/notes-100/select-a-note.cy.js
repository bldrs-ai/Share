import {waitForModel, homepageSetup, setCookieAndVisitHome} from '../../support/utils'


describe('select-a-note', () => {
  context('Open index.ifc and notes', () => {
    beforeEach(() => {
      homepageSetup()
    })
    it('The list of notes is updated to display only the selected note', () => {
      setCookieAndVisitHome()
      waitForModel()
      cy.get('[data-testid="control-button-notes"]').click()
      cy.get(':nth-child(1) > .MuiPaper-root > [data-testid="card-body"] > .MuiCardContent-root').contains('Test Issue body').click()
      cy.get('.MuiCardHeader-title').contains('Local issue 2')
    })
    it('A list of comments attached to the note to be visible', () => {
      setCookieAndVisitHome()
      waitForModel()
      cy.get('[data-testid="control-button-notes"]').click()
      cy.get(':nth-child(1) > .MuiPaper-root > [data-testid="card-body"] > .MuiCardContent-root').contains('Test Issue body').click()
      cy.get(':nth-child(2) > .MuiPaper-root > .MuiCardContent-root > p').contains('Test Comment 1')
    })
    it('The title on the navbar changes to NOTE', () => {
      setCookieAndVisitHome()
      waitForModel()
      cy.get('[data-testid="control-button-notes"]').click()
      cy.get(':nth-child(1) > .MuiPaper-root > [data-testid="card-body"] > .MuiCardContent-root').contains('Test Issue body').click()
      cy.get('.css-1oum0wi > .css-8lgfcg > :nth-child(1) > .css-95g4uk > [data-testid="panelTitle"]').should('have.text', 'NOTE')
    })
    it('Back to the list button to be visible on the navbar', () => {
      setCookieAndVisitHome()
      cy()
      waitForModel.get('[data-testid="control-button-notes"]').click()
      cy.get(':nth-child(1) > .MuiPaper-root > [data-testid="card-body"] > .MuiCardContent-root').contains('Test Issue body').click()
      cy.get('[data-testid="Back to the list"]')
    })
  })
})
