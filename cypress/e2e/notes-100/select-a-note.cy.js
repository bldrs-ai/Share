import {waitForModel, homepageSetup, setCookieAndVisitHome} from '../../support/utils'


describe('select-a-note', () => {
  context('Open index.ifc and notes', () => {
    beforeEach(() => {
      homepageSetup()
      setCookieAndVisitHome()
      waitForModel()
    })
    it('The list of notes is updated to display only the selected note', () => {
      cy.get('[data-testid="control-button-notes"]').click()
      cy.get(':nth-child(1) > .MuiPaper-root > [data-testid="card-body"] > .MuiCardContent-root').contains('issueBody_4').click()
      cy.get('.MuiCardHeader-title').contains('issueTitle_4')
    })
    it('A list of comments attached to the note to be visible', () => {
      cy.get('[data-testid="control-button-notes"]').click()
      cy.get(':nth-child(1) > .MuiPaper-root > [data-testid="card-body"] > .MuiCardContent-root').contains('issueBody_4').click()
      cy.get(':nth-child(2) > .MuiPaper-root > .MuiCardContent-root > p').contains('testComment_1')
    })
    it('The title on the navbar changes to NOTE', () => {
      cy.get('[data-testid="control-button-notes"]').click()
      cy.get(':nth-child(1) > .MuiPaper-root > [data-testid="card-body"] > .MuiCardContent-root').contains('issueBody_4').click()
      cy.get('.css-1oum0wi > .css-8lgfcg > :nth-child(1) > .css-95g4uk > [data-testid="panelTitle"]').should('have.text', 'NOTE')
    })
    it('Back to the list button to be visible on the navbar', () => {
      cy.get('[data-testid="control-button-notes"]').click()
      cy.get(':nth-child(1) > .MuiPaper-root > [data-testid="card-body"] > .MuiCardContent-root').contains('issueBody_4').click()
      cy.get('[data-testid="Back to the list"]')
    })
  })
})
