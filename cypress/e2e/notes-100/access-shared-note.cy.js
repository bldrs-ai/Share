import '@percy/cypress'
import {TITLE_NOTE, TITLE_NOTES} from '../../../src/Components/Notes/component'
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
    it('Notes open - Screen', () => {
      cy.get(`[data-testid="PanelTitle-${TITLE_NOTES}"]`).contains(TITLE_NOTES)
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
      cy.get(`[data-testid="PanelTitle-${TITLE_NOTE}"]`).contains(TITLE_NOTE)
      cy.get('[data-testid="Back to the list"]').should('exist')
    })

    // TODO(https://github.com/bldrs-ai/Share/issues/1269): fix and re-enable
    it.skip('Shared note and comment to be visible', () => {
      cy.get('[data-testid="list-notes"] > :nth-child(4) > [data-testid="note-card"] p').contains('testComment_1')
      cy.get('.MuiCardHeader-title').contains('issueTitle_4')
    })
  })
})

