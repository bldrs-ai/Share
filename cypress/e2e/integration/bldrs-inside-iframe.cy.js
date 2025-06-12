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
  const REQUEST_SUCCESS_CODE = 200
  const REMOTE_IFC_URL = '**/Momentum.ifc'
  const REMOTE_IFC_FIXTURE = 'TestFixture.ifc'

  /**
   * Copy web page to target directory to make it accessible to cypress.
   */
  before(() => {
    const fixtures = [
      'bldrs-inside-iframe.html',
      'bldrs-inside-iframe-bundle.js',
      'bldrs-inside-iframe-bundle.js.map',
    ]
    const targetDirectory = 'docs/cypress/static/'
    for (const fixture of fixtures) {
      cy.fixture(fixture, null).then((content) => {
        const outPath = path.join(targetDirectory, fixture)
        cy.writeFile(outPath, content)
      })
    }
    console.log(`Copied bldrs-inside-iframe{.html,-bundle.js,-bundle.js.map} ${targetDirectory}`)
  })

  beforeEach(() => {
    cy.clearCookies()
    cy.visit(SYSTEM_UNDER_TEST)
    cy.get('iframe').iframe().as('iframe')
  })

  it.only('should emit ready-messsage when page load completes', () => {
    cy.get('@iframe').trigger('keydown', {keyCode: KEYCODE_ESC})
    cy.get('#cbxIsReady').should('exist').and('be.checked')
  })

  it('should load model when LoadModel-message emitted', () => {
    const model = 'Swiss-Property-AG/Momentum-Public/main/Momentum.ifc'
    const modelRootNodeName = 'Proxy with extruded box'
    cy.get('@iframe').trigger('keydown', {keyCode: KEYCODE_ESC})

    // cy.get('@iframe').find('[data-ifc-model="1"]').should('exist')
    // cy.get('#messagesCount').contains('1') //First loaded message

    cy.get('#txtSendMessageType').clear().type('ai.bldrs-share.LoadModel')
    const msg = {
      githubIfcPath: model,
    }

    cy.intercept('GET', REMOTE_IFC_URL, {fixture: REMOTE_IFC_FIXTURE}).as('loadModel')

    cy.get('#txtSendMessagePayload').clear()
        .type(JSON.stringify(msg), {parseSpecialCharSequences: false})
    cy.get('#btnSendMessage').click()
    cy.wait('@loadModel').its('response.statusCode').should('eq', REQUEST_SUCCESS_CODE)
    // cy.get('@iframe').find('[data-ifc-model="1"]').should('exist')
    cy.get('@iframe').contains('span', modelRootNodeName).should('exist')
    // cy.get('#messagesCount').contains('2') //Second loaded message received
  })

  it('should select element when SelectElements-message emitted', () => {
    cy.get('@iframe').trigger('keydown', {keyCode: KEYCODE_ESC})
    cy.get('#lastMessageReceivedAction').contains(/ModelLoaded/i)
    const globalId = '02uD5Qe8H3mek2PYnMWHk1'
    // cy.get('@iframe').find('[data-ifc-model="1"]').should('exist')
    cy.get('#txtSendMessageType').clear().type('ai.bldrs-share.SelectElements')
    const msg = {
      globalIds: [globalId],
    }
    cy.get('#txtSendMessagePayload').clear().type(JSON.stringify(msg), {parseSpecialCharSequences: false})
    cy.get('#btnSendMessage').click()
    cy.get('@iframe').findByRole('button', {name: /Properties/}).click()
    cy.get('@iframe').contains('span', /621/).should('exist')
  })

  it('should emit SelectionChanged-message when element was selected through the menu and when cleared', () => {
    const targetElementId = '3vMqyUfHj3tgritpIZS4iG'
    cy.get('@iframe').trigger('keydown', {keyCode: KEYCODE_ESC})
    cy.get('#lastMessageReceivedAction').contains(/ModelLoaded/i)
    cy.get('@iframe').findByText(/bldrs/i).click()
    cy.get('@iframe').findByText(/build/i).click()
    cy.get('@iframe').findByText(/every/i).click()
    cy.get('@iframe').findByText(/thing/i).click()
    cy.get('@iframe').findAllByText(/together/i).first().click()

    cy.get('#txtLastMsg').should(($txtLastMsg) => {
      const msg = JSON.parse($txtLastMsg.val())
      assert.equal(msg.api, 'fromWidget')
      assert.equal(msg.widgetId, 'bldrs-share')
      assert.exists(msg.requestId)
      assert.exists(msg.data)
      assert.equal(msg.action, 'ai.bldrs-share.SelectionChanged')
      assert.equal(msg.data['current'][0], targetElementId)
    })

    cy.get('@iframe').findAllByText(/together/i).last().click()
    cy.get('#lastMessageReceivedAction').contains(/SelectionChanged/i)

    cy.get('@iframe').findByRole('button', {name: /Clear/}).click()

    cy.get('#txtLastMsg').should(($txtLastMsg) => {
      const msg = JSON.parse($txtLastMsg.val())
      assert.equal(msg.api, 'fromWidget')
      assert.equal(msg.widgetId, 'bldrs-share')
      assert.exists(msg.requestId)
      assert.exists(msg.data)
      assert.equal(msg.action, 'ai.bldrs-share.SelectionChanged')
      assert.equal(msg.data['current'].length, 0)
    })
  })

  it('should hide UI components when UIComponentsVisibility-message emitted', () => {
    cy.get('@iframe').trigger('keydown', {keyCode: KEYCODE_ESC})
    cy.get('#txtSendMessageType').clear().type('ai.bldrs-share.UIComponentsVisibility')
    const msg = {
      navigationPanel: false,
      modelInteraction: false,
    }
    cy.get('#txtSendMessagePayload').clear().type(JSON.stringify(msg), {parseSpecialCharSequences: false})
    cy.get('#btnSendMessage').click()

    cy.findByRole('tree', {label: 'IFC Navigator'}).should('not.exist')
    cy.get('@iframe').findByRole('button', {name: /Notes/}).should('not.exist')
    cy.get('@iframe').findByRole('button', {name: /Properties/}).should('not.exist')
    cy.get('@iframe').findByRole('button', {name: /Section/}).should('not.exist')
    cy.get('@iframe').findByRole('button', {name: /Clear/}).should('not.exist')
  })


  it('should suppress about dialog SuppressAboutDialogHandler message with true value emitted', () => {
    cy.get('#txtSendMessageType').clear().type('ai.bldrs-share.SuppressAboutDialog')
    const msg = {
      isSuppressed: true,
    }
    cy.get('#txtSendMessagePayload').clear().type(JSON.stringify(msg), {parseSpecialCharSequences: false})
    cy.get('#btnSendMessage').click()

    cy.get('@iframe').findByRole('dialog', {timeout: 300000}).should('not.exist')
  })


  it('should not suppress about dialog SuppressAboutDialogHandler message with false value emitted', () => {
    cy.get('#txtSendMessageType').clear().type('ai.bldrs-share.SuppressAboutDialog')
    const msg = {
      isSuppressed: false,
    }
    cy.get('#txtSendMessagePayload').clear().type(JSON.stringify(msg), {parseSpecialCharSequences: false})
    cy.get('#btnSendMessage').click()

    cy.get('@iframe').findByRole('dialog', {timeout: 300000}).should('exist')
  })

  it('should hide element when HideElements-message emitted', () => {
    cy.get('@iframe').trigger('keydown', {keyCode: KEYCODE_ESC})
    cy.get('#lastMessageReceivedAction').contains(/ModelLoaded/i)
    const globalId = '02uD5Qe8H3mek2PYnMWHk1'

    // send a hide elements message
    cy.get('#txtSendMessageType').clear().type('ai.bldrs-share.HideElements')
    const msg = {
      globalIds: [globalId],
    }
    cy.get('#txtSendMessagePayload').clear().type(JSON.stringify(msg), {parseSpecialCharSequences: false})
    cy.get('#btnSendMessage').click()

    // trying to select the hidden element
    cy.get('#txtSendMessageType').clear().type('ai.bldrs-share.SelectElements')
    cy.get('#btnSendMessage').click()

    // hidden elements can't be selected
    cy.get('#lastMessageReceivedAction').should('not.include.text', /SelectionChanged/i)
  })

  it('should unhide element when HideElements-message emitted', () => {
    cy.get('@iframe').trigger('keydown', {keyCode: KEYCODE_ESC})
    cy.get('#lastMessageReceivedAction').contains(/ModelLoaded/i)
    const globalId = '02uD5Qe8H3mek2PYnMWHk1'

    // send a hide elements message
    cy.get('#txtSendMessageType').clear().type('ai.bldrs-share.HideElements')
    const msg = {
      globalIds: [globalId],
    }
    cy.get('#txtSendMessagePayload').clear().type(JSON.stringify(msg), {parseSpecialCharSequences: false})
    cy.get('#btnSendMessage').click()

    // Unhide the hidden element
    cy.get('#txtSendMessageType').clear().type('ai.bldrs-share.UnhideElements')
    cy.get('#btnSendMessage').click()

    // Can be selected again
    cy.get('#txtSendMessageType').clear().type('ai.bldrs-share.SelectElements')
    cy.get('#btnSendMessage').click()
    cy.get('#lastMessageReceivedAction').contains(/SelectionChanged/i)

    cy.get('#txtLastMsg').should(($txtLastMsg) => {
      const lastMsg = JSON.parse($txtLastMsg.val())
      assert.equal(lastMsg.api, 'fromWidget')
      assert.equal(lastMsg.widgetId, 'bldrs-share')
      assert.exists(lastMsg.requestId)
      assert.exists(lastMsg.data)
      assert.equal(lastMsg.action, 'ai.bldrs-share.SelectionChanged')
      assert.equal(lastMsg.data['current'].length, 1)
      assert.equal(lastMsg.data['current'][0], globalId)
    })
  })

  it('should unhide all elements when HideElements-message emitted with wildcard', () => {
    cy.get('@iframe').trigger('keydown', {keyCode: KEYCODE_ESC})
    cy.get('#lastMessageReceivedAction').contains(/ModelLoaded/i)
    const globalId = '02uD5Qe8H3mek2PYnMWHk1'

    // send a hide elements message
    cy.get('#txtSendMessageType').clear().type('ai.bldrs-share.HideElements')
    const msg = {
      globalIds: [globalId],
    }
    cy.get('#txtSendMessagePayload').clear().type(JSON.stringify(msg), {parseSpecialCharSequences: false})
    cy.get('#btnSendMessage').click()

    // Unhide the hidden element
    cy.get('#txtSendMessageType').clear().type('ai.bldrs-share.UnhideElements')
    const hidemsg = {
      globalIds: '*',
    }
    cy.get('#txtSendMessagePayload').clear().type(JSON.stringify(hidemsg), {parseSpecialCharSequences: false})
    cy.get('#btnSendMessage').click()

    // Can be selected again
    cy.get('#txtSendMessageType').clear().type('ai.bldrs-share.SelectElements')
    cy.get('#txtSendMessagePayload').clear().type(JSON.stringify(msg), {parseSpecialCharSequences: false})
    cy.get('#btnSendMessage').click()
    cy.get('#lastMessageReceivedAction').contains(/SelectionChanged/i)
  })

  it('should emit HiddenElments message when element is hidden', () => {
    const hiddenElementsCount = 10
    cy.get('@iframe').trigger('keydown', {keyCode: KEYCODE_ESC})
    cy.get('#lastMessageReceivedAction').contains(/ModelLoaded/i)

    // send a hide elements message
    cy.get('@iframe').findByRole('tree', {label: 'IFC Navigator'}).click()
    cy.get('@iframe').findByTestId('hide-icon').should('exist')
    cy.get('@iframe').findByTestId('hide-icon').click()

    cy.get('#txtLastMsg').should(($txtLastMsg) => {
      const response = JSON.parse($txtLastMsg.val())
      assert.equal(response.api, 'fromWidget')
      assert.equal(response.widgetId, 'bldrs-share')
      assert.exists(response.requestId)
      assert.exists(response.data)
      assert.equal(response.action, 'ai.bldrs-share.HiddenElements')
      assert.equal(response.data['current'].length, hiddenElementsCount)
    })

    cy.get('@iframe').findByTestId('unhide-icon').click()

    cy.get('#txtLastMsg').should(($txtLastMsg) => {
      const msg = JSON.parse($txtLastMsg.val())
      assert.equal(msg.api, 'fromWidget')
      assert.equal(msg.widgetId, 'bldrs-share')
      assert.exists(msg.requestId)
      assert.exists(msg.data)
      assert.equal(msg.action, 'ai.bldrs-share.HiddenElements')
      assert.equal(msg.data['current'].length, 0)
    })
  })

  it('should set defaultColor to gray, and color one element blue by view settings', () => {
    cy.get('@iframe').trigger('keydown', {keyCode: KEYCODE_ESC})
    cy.get('#lastMessageReceivedAction').contains(/ModelLoaded/i)
    const defaultGrayColor = {
      x: 0.85,
      y: 0.85,
      z: 0.85,
      w: 1,
    }
    const colorBlue = {
      x: 0.2,
      y: 0.3,
      z: 0.9,
      w: 1,
    }
    cy.get('#txtSendMessageType').clear().type('ai.bldrs-share.ChangeViewSettings')
    const msg = {
      customViewSettings: {
        defaultColor: defaultGrayColor,
        globalIdsToColorMap: {
          '3qoAS2W2r7m9vxQ0sGR5Rc': colorBlue,
        },
      },
    }
    cy.get('#txtSendMessagePayload').clear().type(JSON.stringify(msg), {parseSpecialCharSequences: false})
    cy.get('#btnSendMessage').click()
  })
})
