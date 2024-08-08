import '@percy/cypress'
import {
  homepageSetup,
  setIsReturningUser,
  visitHomepageWaitForModel,
} from '../../../support/utils'


/** {@link https://github.com/bldrs-ai/Share/issues/1254} */
describe('Search 100: Search model based on element name ', () => {
  beforeEach(() => {
    homepageSetup()
    setIsReturningUser()
  })

  context('Returning user visits homepage', () => {
    beforeEach(() => {
      visitHomepageWaitForModel()
      cy.get('[data-testid="control-button-search"]').click()
    })

    it(`Open Search > Enter "together" > Press Enter >
       Search box with query visible, "Together" items highlighted in tree and scene  - Screen`, () => {
      cy.get('[data-testid="textfield-search-query"]').type('together{enter}')
      cy.percySnapshot()
    })
    it(`Open Search > Enter "together" > Press Activate >
      Search box with query visible, "Together" items highlighted in tree and scene  - Screen`, () => {
      cy.get('[data-testid="textfield-search-query"]').type('together')
      cy.get('[data-testid="button-search-activate"]').click()
      cy.percySnapshot()
    })
  })
})
