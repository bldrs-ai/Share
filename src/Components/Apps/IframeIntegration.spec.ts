import {expect, test} from '@playwright/test'
import {homepageSetup} from '../../tests/e2e/utils'
import {expectScreen} from '../../tests/screens'
import {readFile} from 'fs/promises'
import path from 'path'
import {writeFile} from 'fs/promises'


const {beforeEach, describe, beforeAll} = test

/**
 * Black-box integration tests for Bldrs running in an iframe.
 * Bldrs emits messages and receives messages via Matrix Widgets API.
 *
 * The setup includes a standalone web page with a Bldrs iframe and wired
 * up message handling. This scenario comes as close as possible to a real-
 * world integration scenario.
 *
 * Migrated from cypress/e2e/integration/bldrs-inside-iframe.cy.js
 */
describe.skip('bldrs inside iframe', () => {
  const REQUEST_SUCCESS_CODE = 200
  const REMOTE_IFC_URL = '**/Momentum.ifc'
  const REMOTE_IFC_FIXTURE = 'TestFixture.ifc'

  /**
   * Copy web page to target directory to make it accessible to playwright.
   */
  beforeAll(async () => {
    const fixtures = [
      'bldrs-inside-iframe.html',
      'bldrs-inside-iframe-bundle.js',
      'bldrs-inside-iframe-bundle.js.map',
    ]
    const targetDirectory = 'docs/cypress/static/'

    for (const fixture of fixtures) {
      try {
        const content = await readFile(`src/tests/fixtures/${fixture}`)
        const outPath = path.join(targetDirectory, fixture)
        await writeFile(outPath, content)
      } catch (error) {
        console.warn(`Could not copy fixture ${fixture}:`, error)
      }
    }
    // eslint-disable-next-line no-console
    console.log(`Copied bldrs-inside-iframe{.html,-bundle.js,-bundle.js.map} ${targetDirectory}`)
  })

  beforeEach(async ({page}) => {
    await homepageSetup(page)
    await page.context().clearCookies()
    await page.context().addCookies([{name: 'isFirstTime', value: '1', url: page.url()}])

    // Visit the iframe test page
    await page.goto('/cypress/static/bldrs-inside-iframe.html')
  })

  test('should emit ready-message when page load completes', async ({page}) => {
    const iframe = page.frameLocator('iframe')
    await iframe.locator('body').press('Escape')
    await expect(page.locator('#cbxIsReady')).toBeChecked()
  })

  test('should load model when LoadModel-message emitted', async ({page}) => {
    const model = 'Swiss-Property-AG/Momentum-Public/main/Momentum.ifc'
    const modelRootNodeName = 'Proxy with extruded box'
    const iframe = page.frameLocator('iframe')

    await iframe.locator('body').press('Escape')

    // Set up message interception
    await page.route(REMOTE_IFC_URL, async (route) => {
      const fixturePath = `src/tests/fixtures/${REMOTE_IFC_FIXTURE}`
      const fixtureContent = await readFile(fixturePath)
      await route.fulfill({
        status: REQUEST_SUCCESS_CODE,
        body: fixtureContent,
      })
    })

    // Send LoadModel message
    await page.locator('#txtSendMessageType').fill('ai.bldrs-share.LoadModel')
    const msg = {
      githubIfcPath: model,
    }
    await page.locator('#txtSendMessagePayload').fill(JSON.stringify(msg))
    await page.locator('#btnSendMessage').click()

    // Wait for model to load and verify navigation
    await iframe.getByTestId('control-button-navigation').click()
    await expect(iframe.getByText(modelRootNodeName)).toBeVisible()
  })

  test('should select element when SelectElements-message emitted', async ({page}) => {
    const iframe = page.frameLocator('iframe')
    await iframe.locator('body').press('Escape')
    await expect(page.locator('#lastMessageReceivedAction')).toContainText(/ModelLoaded/i)

    const globalId = '02uD5Qe8H3mek2PYnMWHk1'

    // Send SelectElements message
    await page.locator('#txtSendMessageType').fill('ai.bldrs-share.SelectElements')
    const msg = {
      globalIds: [globalId],
    }
    await page.locator('#txtSendMessagePayload').fill(JSON.stringify(msg))
    await page.locator('#btnSendMessage').click()

    // Verify selection in properties panel
    await iframe.getByRole('button', {name: /Properties/}).click()
    await expect(iframe.getByText('621')).toBeVisible()
  })

  test('should emit SelectionChanged-message when element was selected through the menu and when cleared', async ({page}) => {
    const targetElementId = '3vMqyUfHj3tgritpIZS4iG'
    const iframe = page.frameLocator('iframe')

    await iframe.locator('body').press('Escape')
    await expect(page.locator('#lastMessageReceivedAction')).toContainText(/ModelLoaded/i)

    // Navigate through the tree structure
    await iframe.getByTestId('control-button-navigation').click()
    await iframe.getByText('Bldrs').click()
    await iframe.getByText('Build').click()
    await iframe.getByText('Every').click()
    await iframe.getByText('Thing').click()
    await iframe.getByText('Together').first().click()

    // Verify SelectionChanged message
    const lastMsgText = await page.locator('#txtLastMsg').inputValue()
    const msg = JSON.parse(lastMsgText)
    expect(msg.api).toBe('fromWidget')
    expect(msg.widgetId).toBe('bldrs-share')
    expect(msg.requestId).toBeDefined()
    expect(msg.data).toBeDefined()
    expect(msg.action).toBe('ai.bldrs-share.SelectionChanged')
    expect(msg.data.current[0]).toBe(targetElementId)

    // Click another element
    await iframe.getByText(/together/i).last().click()
    await expect(page.locator('#lastMessageReceivedAction')).toContainText(/SelectionChanged/i)

    // Clear selection
    await iframe.getByRole('button', {name: /Clear/}).click()

    // Verify cleared selection message
    const clearedMsgText = await page.locator('#txtLastMsg').inputValue()
    const clearedMsg = JSON.parse(clearedMsgText)
    expect(clearedMsg.api).toBe('fromWidget')
    expect(clearedMsg.widgetId).toBe('bldrs-share')
    expect(clearedMsg.requestId).toBeDefined()
    expect(clearedMsg.data).toBeDefined()
    expect(clearedMsg.action).toBe('ai.bldrs-share.SelectionChanged')
    expect(clearedMsg.data.current.length).toBe(0)
  })

  test.skip('should hide UI components when UIComponentsVisibility-message emitted', async ({page}) => {
    const iframe = page.frameLocator('iframe')
    await iframe.locator('body').press('Escape')

    // Send UIComponentsVisibility message
    await page.locator('#txtSendMessageType').fill('ai.bldrs-share.UIComponentsVisibility')
    const msg = {
      navigationPanel: false,
      modelInteraction: false,
    }
    await page.locator('#txtSendMessagePayload').fill(JSON.stringify(msg))
    await page.locator('#btnSendMessage').click()

    // Verify UI components are hidden
    await expect(page.getByRole('tree', {name: 'IFC Navigator'})).toHaveCount(0)
    await expect(iframe.getByRole('button', {name: /Notes/})).toHaveCount(0)
    await expect(iframe.getByRole('button', {name: /Properties/})).toHaveCount(0)
    await expect(iframe.getByRole('button', {name: /Section/})).toHaveCount(0)
    await expect(iframe.getByRole('button', {name: /Clear/})).toHaveCount(0)
  })

  test.skip('should suppress about dialog SuppressAboutDialogHandler message with true value emitted', async ({page}) => {
    const iframe = page.frameLocator('iframe')

    // Send SuppressAboutDialog message
    await page.locator('#txtSendMessageType').fill('ai.bldrs-share.SuppressAboutDialog')
    const msg = {
      isSuppressed: true,
    }
    await page.locator('#txtSendMessagePayload').fill(JSON.stringify(msg))
    await page.locator('#btnSendMessage').click()

    // Verify about dialog is suppressed
    await expect(iframe.getByRole('dialog')).toHaveCount(0)
  })

  test.skip('should not suppress about dialog SuppressAboutDialogHandler message with false value emitted', async ({page}) => {
    const iframe = page.frameLocator('iframe')

    // Send SuppressAboutDialog message
    await page.locator('#txtSendMessageType').fill('ai.bldrs-share.SuppressAboutDialog')
    const msg = {
      isSuppressed: false,
    }
    await page.locator('#txtSendMessagePayload').fill(JSON.stringify(msg))
    await page.locator('#btnSendMessage').click()

    // Verify about dialog is not suppressed
    await expect(iframe.getByRole('dialog')).toBeVisible()
  })

  test('should hide element when HideElements-message emitted', async ({page}) => {
    const iframe = page.frameLocator('iframe')
    await iframe.locator('body').press('Escape')
    await expect(page.locator('#lastMessageReceivedAction')).toContainText(/ModelLoaded/i)

    const globalId = '02uD5Qe8H3mek2PYnMWHk1'

    // Send HideElements message
    await page.locator('#txtSendMessageType').fill('ai.bldrs-share.HideElements')
    const msg = {
      globalIds: [globalId],
    }
    await page.locator('#txtSendMessagePayload').fill(JSON.stringify(msg))
    await page.locator('#btnSendMessage').click()

    // Try to select the hidden element
    await page.locator('#txtSendMessageType').fill('ai.bldrs-share.SelectElements')
    await page.locator('#btnSendMessage').click()

    // Hidden elements can't be selected
    await expect(page.locator('#lastMessageReceivedAction')).not.toContainText(/SelectionChanged/i)
  })

  test('should unhide element when HideElements-message emitted', async ({page}) => {
    const iframe = page.frameLocator('iframe')
    await iframe.locator('body').press('Escape')
    await expect(page.locator('#lastMessageReceivedAction')).toContainText(/ModelLoaded/i)

    const globalId = '02uD5Qe8H3mek2PYnMWHk1'

    // Send HideElements message
    await page.locator('#txtSendMessageType').fill('ai.bldrs-share.HideElements')
    const msg = {
      globalIds: [globalId],
    }
    await page.locator('#txtSendMessagePayload').fill(JSON.stringify(msg))
    await page.locator('#btnSendMessage').click()

    // Unhide the hidden element
    await page.locator('#txtSendMessageType').fill('ai.bldrs-share.UnhideElements')
    await page.locator('#btnSendMessage').click()

    // Can be selected again
    await page.locator('#txtSendMessageType').fill('ai.bldrs-share.SelectElements')
    await page.locator('#btnSendMessage').click()
    await expect(page.locator('#lastMessageReceivedAction')).toContainText(/SelectionChanged/i)

    // Verify the selection message
    const lastMsgText = await page.locator('#txtLastMsg').inputValue()
    const lastMsg = JSON.parse(lastMsgText)
    expect(lastMsg.api).toBe('fromWidget')
    expect(lastMsg.widgetId).toBe('bldrs-share')
    expect(lastMsg.requestId).toBeDefined()
    expect(lastMsg.data).toBeDefined()
    expect(lastMsg.action).toBe('ai.bldrs-share.SelectionChanged')
    expect(lastMsg.data.current.length).toBe(1)
    expect(lastMsg.data.current[0]).toBe(globalId)
  })

  test('should unhide all elements when HideElements-message emitted with wildcard', async ({page}) => {
    const iframe = page.frameLocator('iframe')
    await iframe.locator('body').press('Escape')
    await expect(page.locator('#lastMessageReceivedAction')).toContainText(/ModelLoaded/i)

    const globalId = '02uD5Qe8H3mek2PYnMWHk1'

    // Send HideElements message
    await page.locator('#txtSendMessageType').fill('ai.bldrs-share.HideElements')
    const msg = {
      globalIds: [globalId],
    }
    await page.locator('#txtSendMessagePayload').fill(JSON.stringify(msg))
    await page.locator('#btnSendMessage').click()

    // Unhide all elements with wildcard
    await page.locator('#txtSendMessageType').fill('ai.bldrs-share.UnhideElements')
    const unhideMsg = {
      globalIds: '*',
    }
    await page.locator('#txtSendMessagePayload').fill(JSON.stringify(unhideMsg))
    await page.locator('#btnSendMessage').click()

    // Can be selected again
    await page.locator('#txtSendMessageType').fill('ai.bldrs-share.SelectElements')
    await page.locator('#txtSendMessagePayload').fill(JSON.stringify(msg))
    await page.locator('#btnSendMessage').click()
    await expect(page.locator('#lastMessageReceivedAction')).toContainText(/SelectionChanged/i)
  })

  test('should emit HiddenElements message when element is hidden', async ({page}) => {
    const hiddenElementsCount = 10
    const iframe = page.frameLocator('iframe')

    await iframe.locator('body').press('Escape')
    await expect(page.locator('#lastMessageReceivedAction')).toContainText(/ModelLoaded/i)

    // Hide elements through UI
    await iframe.getByTestId('control-button-navigation').click()
    await expect(iframe.getByTestId('hide-icon')).toBeVisible()
    await iframe.getByTestId('hide-icon').click()

    // Verify HiddenElements message
    const lastMsgText = await page.locator('#txtLastMsg').inputValue()
    const response = JSON.parse(lastMsgText)
    expect(response.api).toBe('fromWidget')
    expect(response.widgetId).toBe('bldrs-share')
    expect(response.requestId).toBeDefined()
    expect(response.data).toBeDefined()
    expect(response.action).toBe('ai.bldrs-share.HiddenElements')
    expect(response.data.current.length).toBe(hiddenElementsCount)

    // Unhide elements
    await iframe.getByTestId('unhide-icon').click()

    // Verify unhidden message
    const unhiddenMsgText = await page.locator('#txtLastMsg').inputValue()
    const msg = JSON.parse(unhiddenMsgText)
    expect(msg.api).toBe('fromWidget')
    expect(msg.widgetId).toBe('bldrs-share')
    expect(msg.requestId).toBeDefined()
    expect(msg.data).toBeDefined()
    expect(msg.action).toBe('ai.bldrs-share.HiddenElements')
    expect(msg.data.current.length).toBe(0)
  })

  test('should set defaultColor to gray, and color one element blue by view settings', async ({page}) => {
    const iframe = page.frameLocator('iframe')
    await iframe.locator('body').press('Escape')
    await expect(page.locator('#lastMessageReceivedAction')).toContainText(/ModelLoaded/i)

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

    // Send ChangeViewSettings message
    await page.locator('#txtSendMessageType').fill('ai.bldrs-share.ChangeViewSettings')
    const msg = {
      customViewSettings: {
        defaultColor: defaultGrayColor,
        globalIdsToColorMap: {
          '3qoAS2W2r7m9vxQ0sGR5Rc': colorBlue,
        },
      },
    }
    await page.locator('#txtSendMessagePayload').fill(JSON.stringify(msg))
    await page.locator('#btnSendMessage').click()

    await expectScreen(page, 'IframeIntegration-view-settings.png')
  })
})
