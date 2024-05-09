import '@percy/cypress'
import {waitForModelReady} from '../../../support/models'
import {
  homepageSetup,
  setIsReturningUser,
  visitHomepageWaitForModel,
} from '../../../support/utils'


/** {@link } */
describe('Search 100: Permalink', () => {
  beforeEach(() => {
    homepageSetup()
    setIsReturningUser()
  })

  context('Returning user visits homepage, Open Seach > Enters "together"', () => {
    beforeEach(() => {
      visitHomepageWaitForModel()
      cy.get('[data-testid="control-button-search"]').click()
      cy.get('[data-testid="textfield-search-query"]').type('together')
    })

    it('Search box with query visible, "Together" items highlighted in tree and scene - Screen', () => {
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
