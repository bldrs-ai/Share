const path = require('path')

/**
 * Black-box integration tests for Bldrs running in an iframe.
 * Bldrs emits messages and receives messages via Matrix Widgets API.
 *
 * The setup includes a standalone web page with a Bldrs iframe and wired
 * up message handling. This scenario comes as close as possible to a real-
 * world integration scenario. An important difference is that the cypress
 * framework itself loads the system under test within an iframe. This means
 * that in all these tests Bldrs runs in an iframe which runs in an iframe.
 */
describe('bldrs inside iframe', () => {
  const SYSTEM_UNDER_TEST = '/cypress/static/bldrs-inside-iframe.html'
  const KEYCODE_ESC = 27

  /**
   * Copy web page to target directory to make it accessible to cypress.
   */
  before(() => {
    const fixtures = ['bldrs-inside-iframe.html', 'bldrs-inside-iframe.js']
    const targetDirectory = 'docs/cypress/static/'
    for (const fixture of fixtures) {
      cy.fixture(fixture, null).then((content) => {
        const outPath = path.join(targetDirectory, fixture)
        cy.writeFile(outPath, content)
      })
    }
  })

  it('should emit ready-messsage when page load completes', () => {
    cy.clearCookies()
    cy.visit(SYSTEM_UNDER_TEST)
    cy.get('#cbxIsReady').should('exist').and('be.checked')
  })

  it('should load model when LoadModel-message emitted', () => {
    const model = 'Swiss-Property-AG/Momentum-Public/main/Momentum.ifc'
    const modelRootNodeName = 'Momentum / KNIK v3'
    cy.clearCookies()
    cy.visit(SYSTEM_UNDER_TEST)
    cy.get('iframe').iframe().click('left')
    cy.get('iframe').iframe().trigger('keydown', {keyCode: KEYCODE_ESC})
    cy.get('#txtSendMessageType').clear().type('ai.bldrs-share.LoadModel')
    const msg = {
      githubIfcPath: model,
    }
    cy.get('#txtSendMessagePayload').clear().type(JSON.stringify(msg), {parseSpecialCharSequences: false})
    cy.get('#btnSendMessage').click()
    cy.get('iframe').iframe().contains('span', modelRootNodeName).should('exist')
  })

  it('should select element when SelectElements-message emitted', () => {
    const globalId = '02uD5Qe8H3mek2PYnMWHk1'
    const expectedExpressId = '621'
    cy.clearCookies()
    cy.visit(SYSTEM_UNDER_TEST)

    cy.get('iframe').iframe().trigger('keydown', {keyCode: KEYCODE_ESC})
    cy.get('#txtSendMessageType').clear().type('ai.bldrs-share.SelectElements')
    const msg = {
      globalIds: [globalId],
    }
    cy.get('#txtSendMessagePayload').clear().type(JSON.stringify(msg), {parseSpecialCharSequences: false})
    cy.get('#btnSendMessage').click()
    cy.get('iframe').iframe().findByRole('button', {name: /Properties/}).click()
    cy.get('iframe').iframe().contains('span', expectedExpressId).should('exist')
  })

  // it('should emit ElementsSelected-message when element was double-clicked', () => {
  //   cy.clearCookies()
  //   cy.visit(SYSTEM_UNDER_TEST)

  //   cy.get('iframe').iframe().trigger('keydown', {keyCode: KEYCODE_ESC})
  //   // eslint-disable-next-line cypress/no-unnecessary-waiting
  //   cy.get('iframe').iframe().find('canvas').click('center')
  //       // eslint-disable-next-line no-magic-numbers
  //       .trigger('wheel', {deltaY: -2000, bubbles: true}).wait(500)
  //       .dblclick('center')
  //   // eslint-disable-next-line cypress/no-unnecessary-waiting, no-magic-numbers
  //   cy.wait(1000)
  //   cy.get('#txtLastMsg').should(($txtLastMsg) => {
  //     const msg = JSON.parse($txtLastMsg.val())
  //     assert.equal(msg.api, 'fromWidget')
  //     assert.equal(msg.widgetId, 'bldrs-share')
  //     assert.exists(msg.requestId)
  //     assert.equal(msg.action, 'ai.bldrs-share.ElementsSelected')
  //     assert.exists(msg.data)
  //   })
  // })

  // it('should emit ElementsDeSelected-message when selection was cleared', () => {
  //   cy.clearCookies()
  //   cy.visit(SYSTEM_UNDER_TEST)

  //   cy.get('iframe').iframe().trigger('keydown', {keyCode: KEYCODE_ESC})
  //   // eslint-disable-next-line cypress/no-unnecessary-waiting
  //   cy.get('iframe').iframe().find('canvas').click('center')
  //       // eslint-disable-next-line no-magic-numbers
  //       .trigger('wheel', {deltaY: -2000, bubbles: true}).wait(500)
  //       .dblclick('center')
  //   // eslint-disable-next-line cypress/no-unnecessary-waiting, no-magic-numbers
  //   cy.wait(1000)
  //   cy.get('iframe').iframe().findByRole('button', {name: /Clear/}).click()
  //   cy.get('#txtLastMsg').should(($txtLastMsg) => {
  //     const msg = JSON.parse($txtLastMsg.val())
  //     assert.equal(msg.api, 'fromWidget')
  //     assert.equal(msg.widgetId, 'bldrs-share')
  //     assert.exists(msg.requestId)
  //     assert.equal(msg.action, 'ai.bldrs-share.ElementsDeSelected')
  //     assert.exists(msg.data)
  //   })
  // })

  it('should hide UI components when UIComponentsVisibility-message emitted', () => {
    cy.clearCookies()
    cy.visit(SYSTEM_UNDER_TEST)

    cy.get('iframe').iframe().trigger('keydown', {keyCode: KEYCODE_ESC})
    cy.get('#txtSendMessageType').clear().type('ai.bldrs-share.UIComponentsVisibility')
    const msg = {
      navigationPanel: false,
      modelInteraction: false,
    }
    cy.get('#txtSendMessagePayload').clear().type(JSON.stringify(msg), {parseSpecialCharSequences: false})
    cy.get('#btnSendMessage').click()

    cy.findByRole('tree', {label: 'IFC Navigator'}).should('not.exist')

    cy.get('iframe').iframe().findByRole('button', {name: /Notes/}).should('not.exist')
    cy.get('iframe').iframe().findByRole('button', {name: /Properties/}).should('not.exist')
    cy.get('iframe').iframe().findByRole('button', {name: /Section/}).should('not.exist')
    cy.get('iframe').iframe().findByRole('button', {name: /Clear/}).should('not.exist')
  })
})
