import {waitForModel, homepageSetup, setCookieAndVisitHome} from '../../support/utils'


describe('select-a-note', () => {
  context('Open index.ifc and notes', () => {
    beforeEach(() => {
      homepageSetup()
    })
    it('The list of notes is updated to display only the selected note', () => {
      setCookieAndVisitHome()
      waitForModel()
    })
  })
})
