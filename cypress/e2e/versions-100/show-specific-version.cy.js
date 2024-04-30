import '@percy/cypress'
import {
  auth0Login,
  homepageSetup,
  returningUserVisitsHomepageWaitForModel,
} from '../../support/utils'
import {
    setupVirtualPathIntercept,
    waitForModelReady,
  } from '../../support/models'


/** {@link https://github.com/bldrs-ai/Share/issues/1154}*/
describe('Versions 100: Show a specific version', () => {
  beforeEach(homepageSetup)
  context('Returning user visits homepage', () => {
    beforeEach(returningUserVisitsHomepageWaitForModel)

    context('User login', () => {
     beforeEach(auth0Login)

      const interceptTag = 'ghModelLoad'
      const versionInterceptTag = 'ghVersionLoad'

      it('Open Momentum.ifc, open versions component and select a version', () => {
        const percyLabelPrefix = 'Versions 100: Show a specific version,'
        cy.get('[data-testid="control-button-open"]').click()
        cy.get('[data-testid="textfield-sample-projects"]').click()

        // set up initial momentum.ifc load
        setupVirtualPathIntercept(
            '/share/v/gh/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc',
            '/Momentum.ifc',
            interceptTag,
          )

        // set up versioned momentum.ifc load (testsha commit)
        setupVirtualPathIntercept(
            '/share/v/gh/Swiss-Property-AG/Momentum-Public/testsha/Momentum.ifc',
            '/Momentum.ifc',
            versionInterceptTag,
          )

        cy.findByText('Momentum').click()
        waitForModelReady(interceptTag)

        cy.get('[data-testid="control-button-versions"]').click()
        cy.get('.MuiTimeline-root > .MuiTimelineItem-root:nth-child(1)').as('firstTimelineItem')
        cy.get('@firstTimelineItem').click()
        waitForModelReady(versionInterceptTag)

        cy.percySnapshot(`${percyLabelPrefix} model visible after version click`)
      })
    })
  })
})
