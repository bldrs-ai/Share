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
      const firstVersionInterceptTag = 'ghFirstVersionLoad'
      const secondVersionInterceptTag = 'ghSecondVersionLoad'
      const thirdVersionInterceptTag = 'ghThirdVersionLoad'
      const percyLabelPrefix = 'Versions 100: Show a specific version,'

      it('Open Momentum.ifc, open versions component, select three versions', () => {
        cy.get('[data-testid="control-button-open"]').click()
        cy.get('[data-testid="textfield-sample-projects"]').click()

        // set up initial momentum.ifc load
        setupVirtualPathIntercept(
          '/share/v/gh/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc',
          '/Momentum.ifc',
          interceptTag)

        // set up versioned momentum.ifc load (testsha commit)
        setupVirtualPathIntercept(
          '/share/v/gh/Swiss-Property-AG/Momentum-Public/testsha/Momentum.ifc',
          '/Momentum.ifc',
          firstVersionInterceptTag)

        // set up versioned momentum.ifc load (testsha2 commit)
        setupVirtualPathIntercept(
          '/share/v/gh/Swiss-Property-AG/Momentum-Public/testsha2/Momentum.ifc',
          '/Momentum.ifc',
          secondVersionInterceptTag)

        // set up versioned momentum.ifc load (testsha3 commit)
        setupVirtualPathIntercept(
          '/share/v/gh/Swiss-Property-AG/Momentum-Public/testsha3/Momentum.ifc',
          '/Momentum.ifc',
          thirdVersionInterceptTag)

        cy.findByText('Momentum').click()
        waitForModelReady(interceptTag)

        // first commit version test
        cy.get('[data-testid="control-button-versions"]').click()
        cy.get('[data-testid="timeline-list"] > .MuiTimelineItem-root:nth-child(1)').as('firstTimelineItem')
        cy.get('@firstTimelineItem').click()
        waitForModelReady(firstVersionInterceptTag)

        cy.percySnapshot(`${percyLabelPrefix} model visible after first commit click`)

        // second commit version test
        cy.get('[data-testid="control-button-versions"]').click()
        cy.get('[data-testid="timeline-list"] > .MuiTimelineItem-root:nth-child(2)').as('secondTimelineItem')
        cy.get('@secondTimelineItem').click()
        waitForModelReady(secondVersionInterceptTag)

        cy.percySnapshot(`${percyLabelPrefix} model visible after second commit click`)

        // third commit version test
        cy.get('[data-testid="control-button-versions"]').click()
        cy.get('[data-testid="timeline-list"] > .MuiTimelineItem-root:nth-child(3)').as('thirdTimelineItem')
        cy.get('@thirdTimelineItem').click()
        waitForModelReady(thirdVersionInterceptTag)

        cy.percySnapshot(`${percyLabelPrefix} model visible after third commit click`)
      })
    })
  })
})
