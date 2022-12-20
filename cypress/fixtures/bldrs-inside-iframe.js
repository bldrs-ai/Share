/**
 * The Bldrs widget.
 */
class BldrsWidget {
  creatorUserId = 'ai.bldrs-share'
  id = 'bldrs-share'
  type = 'm.custom'
  url = null
  waitForIframeLoad = false
}

/**
 * The Bldrs Widget Driver.
 */
class BldrsWidgetDriver {
  // eslint-disable-next-line require-jsdoc
  askOpenID(observer) {
    // not implemented yet
  }

  // eslint-disable-next-line require-jsdoc
  getTurnServers() {
    return undefined
  }

  // eslint-disable-next-line require-jsdoc
  navigate(uri) {
    return Promise.resolve(undefined)
  }

  // NOSONAR
  // eslint-disable-next-line require-jsdoc
  readEventRelations(
      eventId,
      roomId,
      relationType,
      eventType,
      from,
      to,
      limit,
      direction,
  ) {
    return Promise.resolve(undefined)
  }

  // eslint-disable-next-line require-jsdoc
  readRoomEvents(eventType, msgtype, limit, roomIds) {
    return Promise.resolve([])
  }

  // eslint-disable-next-line require-jsdoc
  readStateEvents(eventType, stateKey, limit, roomIds) {
    return Promise.resolve([])
  }

  // eslint-disable-next-line require-jsdoc
  sendEvent(eventType, content, stateKey, roomId) {
    return Promise.resolve(undefined)
  }

  // eslint-disable-next-line require-jsdoc
  sendToDevice(eventType, encrypted, contentMap) {
    return Promise.resolve(undefined)
  }

  // eslint-disable-next-line require-jsdoc
  validateCapabilities(requested) {
    return Promise.resolve(requested)
  }
}

/**
 * Message types.
 */
const EVENT_CLIENT_SELECT_ELEMENTS = 'ai.bldrs-share.ElementsSelected'
const EVENT_CLIENT_DESELECT_ELEMENTS = 'ai.bldrs-share.ElementsDeSelected'

document.addEventListener('DOMContentLoaded', function(event) {
  const container = document.getElementById('bldrs-widget-iframe')
  const bldrsWidget = new BldrsWidget()
  bldrsWidget.url = `${location.protocol}//${location.host}`
  // eslint-disable-next-line no-undef
  const widget = new mxwidgets.Widget(bldrsWidget)
  const driver = new BldrsWidgetDriver()
  // eslint-disable-next-line no-undef
  const api = new mxwidgets.ClientWidgetApi(widget, container, driver)

  const cbxIsReady = document.getElementById('cbxIsReady')
  const txtLastMsg = document.getElementById('txtLastMsg')
  const txtSendMessageType = document.getElementById('txtSendMessageType')
  const txtSendMessagePayload = document.getElementById('txtSendMessagePayload')
  const btnSendMessage = document.getElementById('btnSendMessage')

  container.src = bldrsWidget.url

  api.on('ready', () => {
    cbxIsReady.checked = true
    console.log('message: ready')
  })

  api.on(`action:${EVENT_CLIENT_SELECT_ELEMENTS}`, (e) => {
    e.preventDefault()
    txtLastMsg.value = JSON.stringify(e.detail)
    api.transport.reply(e.detail, {})
  })

  api.on(`action:${EVENT_CLIENT_DESELECT_ELEMENTS}`, (e) => {
    e.preventDefault()
    txtLastMsg.value = JSON.stringify(e.detail)
    api.transport.reply(e.detail, {})
  })

  btnSendMessage.addEventListener('click', () => {
    const messageType = txtSendMessageType.value
    const messagePayload = JSON.parse(txtSendMessagePayload.value)
    api.transport.send(messageType, messagePayload)
  })
})
