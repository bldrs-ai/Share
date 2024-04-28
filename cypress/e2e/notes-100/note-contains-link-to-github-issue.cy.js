import {waitForModel, homepageSetup, setCookieAndVisitHome} from '../../support/utils'


describe('select-a-note', () => {
  context('Open index.ifc and notes', () => {
    beforeEach(() => {
      homepageSetup()
    })
    it('Github link is visible on a note card in the list', () => {
      setCookieAndVisitHome()
      waitForModel()
      cy.get('[data-testid="control-button-notes"]').click()
      cy.get('[data-testid="Open in Github"]')
    })
    it('Github link is visible on a note card when the note selected', () => {
      setCookieAndVisitHome()
      waitForModel()
      cy.get('[data-testid="control-button-notes"]').click()
      cy.get(':nth-child(1) > .MuiPaper-root > [data-testid="card-body"] > .MuiCardContent-root').contains('issueBody_4').click()
      cy.get('.MuiCardHeader-title').contains('issueTitle_4')
      cy.get('[data-testid="Open in Github"]')
    })
  })
})
