import {waitForModel, homepageSetup, setIsReturningUser} from '../../support/utils'


describe('select-a-note', () => {
  context('Open index.ifc and notes', () => {
    beforeEach(() => {
      homepageSetup()
      setIsReturningUser()
      waitForModel()
    })
    it('Github link is visible on a note card in the list', () => {
      cy.get('[data-testid="control-button-notes"]').click()
      cy.get('[data-testid="Open in Github"]')
    })
    it('Github link is visible on a note card when the note selected', () => {
      cy.get('[data-testid="control-button-notes"]').click()
      cy.get(':nth-child(1) > .MuiPaper-root > [data-testid="card-body"] > .MuiCardContent-root').contains('issueBody_4').click()
      cy.get('.MuiCardHeader-title').contains('issueTitle_4')
      cy.get('[data-testid="Open in Github"]')
    })
  })
})
