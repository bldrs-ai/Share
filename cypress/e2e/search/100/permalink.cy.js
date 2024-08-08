import '@percy/cypress'
import {waitForModelReady} from '../../../support/models'
import {
  homepageSetup,
  setIsReturningUser,
} from '../../../support/utils'


/** {@link https://github.com/bldrs-ai/Share/issues/1180} */
describe('Search 100: Permalink', () => {
  beforeEach(() => {
    homepageSetup()
    setIsReturningUser()
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
