import '@percy/cypress'
import {homepageSetup, setCookieAndVisitHome, waitForModel} from '../../support/utils'


describe('render-description-of-screenshot', () => {
  context('Model is open', () => {
    beforeEach(() => {
      homepageSetup()
    })

    it('Click ControlButton with magic wand icon - snap', () => {
      setCookieAndVisitHome()
      waitForModel()
      cy.findByTitle('Rendering').click()
      // await(waitFor(() => expect(document.title).toBe('Imagine')))
      cy.percySnapshot()
    })
  })
})
