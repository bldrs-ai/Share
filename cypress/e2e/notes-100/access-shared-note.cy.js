import {waitForModel, homepageSetup} from '../../support/utils'

// From https://github.com/bldrs-ai/Share/issues/1072
describe('Notes 100 - Access shared note', () => {
  context('Access shared link containing the path to the general notes', () => {
    beforeEach(() => {
      homepageSetup()
      cy.setCookie('isFirstTime', '1')
      cy.visit('/share/v/p/index.ifc#c:-133.022,131.828,161.85,-38.078,22.64,-2.314;i:')
      waitForModel()
    })
    it('Panel title to contain NOTES string', () => {
      cy.get('[data-testid="panelTitle"]').contains('NOTES')
    })
    it('Notes list to be visible', () => {
      cy.get('.MuiList-root').should('exist')
    })
  })
  context('Access the shared link containing the path to a note index', () => {
    beforeEach(() => {
      homepageSetup()
      cy.setCookie('isFirstTime', '1')
      cy.visit('http://localhost:8080/share/v/p/index.ifc#c:-26.91,28.84,112.47,-22,16.21,-3.48;i:2')
      waitForModel()
    })
      it('Panel title to contain NOTE string', () => {
        cy.get('[data-testid="panelTitle"]').contains('NOTE')
      })
      it('Panel nav to contain back button', () => {
        cy.get('[data-testid="Back to the list"]').should('exist')
      })
      it('Shared note to be visible', () => {
        cy.get('.MuiList-root > :nth-child(1) > .MuiCardContent-root').contains('Test Issue body')
      })
      it('Notes comments to be visible', () => {
        cy.get(':nth-child(2) > .MuiPaper-root > .MuiCardContent-root').contains('Test Comment 1')
      })
  })
})
