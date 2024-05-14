import '@percy/cypress'
import {waitForModel, homepageSetup, setIsReturningUser} from '../../support/utils'

/** {@link https://github.com/bldrs-ai/Share/issues/1072} */
describe('Notes 100: Access shared note', () => {
  beforeEach(() => {
    homepageSetup()
    setIsReturningUser()
  })
  context('Returning user accessing permalink with notes panel open', () => {
    beforeEach(() => {
      cy.visit('/share/v/p/index.ifc#c:-133.022,131.828,161.85,-38.078,22.64,-2.314;i:')
      waitForModel()
    })
    it.only('Notes open - Screen', () => {
      // Panel title to contain 'NOTES' string
      cy.get('[data-testid="panelTitle"]').contains('NOTES')
      // List of notes to be visible
      cy.get('.MuiList-root').should('exist')
      cy.percySnapshot()
    })
  })
  context('Returning user accessing permalink with note selected', () => {
    beforeEach(() => {
      cy.visit('/share/v/p/index.ifc#c:-26.91,28.84,112.47,-22,16.21,-3.48;i:126')
      waitForModel()
    })
    it('Panel title to contain NOTE string and back button', () => {
      cy.get('[data-testid="panelTitle"]').contains('NOTE')
      cy.get('[data-testid="Back to the list"]').should('exist')
    })
    it('Shared note and comment to be visible', () => {
      cy.get('[data-testid="list-notes"] > :nth-child(4) > [data-testid="note-card"] p').contains('testComment_1')
      cy.get('.MuiCardHeader-title').contains('issueTitle_4')
    })
  })
})

