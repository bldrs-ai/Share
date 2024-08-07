import '@percy/cypress'
import {waitForModelReady} from '../../../support/models'
import {
  homepageSetup,
  setIsReturningUser,
  visitHomepageWaitForModel,
} from '../../../support/utils'


/** {@link https://github.com/bldrs-ai/Share/issues/1180} */
describe('Search 100: Permalink', () => {
  beforeEach(() => {
    homepageSetup()
    setIsReturningUser()
  })

  context('Returning user visits homepage', () => {
    beforeEach(() => {
      visitHomepageWaitForModel()
      cy.get('[data-testid="control-button-search"]').click()
    })

    it(`Open Search > Enters "together" > Presses Enter >
       Search box with query visible, "Together" items highlighted in tree and scene  - Screen`, () => {
      cy.get('[data-testid="textfield-search-query"]').type('together{enter}')
      cy.percySnapshot()
    })
    it(`Open Search > Enters "together" > Presses Activate >
      Search box with query visible, "Together" items highlighted in tree and scene  - Screen`, () => {
      cy.get('[data-testid="textfield-search-query"]').type('together')
      cy.get('[data-testid="button-search-activate"]').type('together')
      cy.percySnapshot()
    })
  })

  context('Returning user visits permalink to "together" search', () => {
    beforeEach(() => {
      cy.visit('/share/v/p/index.ifc?q=together#n:;s:')
      waitForModelReady('bounceSearch')
    })

    it('Search box with query visible, "Together" items highlighted in tree and scene - Screen', () => {
      cy.percySnapshot()
    })
  })
})
