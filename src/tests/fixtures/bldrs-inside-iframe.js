import * as mxwidgets from 'matrix-widget-api'
import debug from '../../src/utils/debug'


/** The Bldrs widget */
class BldrsWidget {
  creatorUserId = 'ai.bldrs-share'
  id = 'bldrs-share'
  type = 'm.custom'
  url = null
  waitForIframeLoad = false
}


/** The Bldrs Widget Driver */
class BldrsWidgetDriver {
  /** */
  askOpenID() {
    // not implemented yet
  }

  /** @return {undefined} */
  getTurnServers() {
    return undefined
  }

  /** @return {Promise} */
  navigate() {
    return Promise.resolve(undefined)
  }

  // NOSONAR
  /** @return {Promise} */
  readEventRelations() {
    return Promise.resolve(undefined)
  }

  /** @return {Promise} */
  readRoomEvents() {
    return Promise.resolve([])
  }

  /** @return {Promise} */
  readStateEvents() {
    return Promise.resolve([])
  }

  /** @return {Promise} */
  sendEvent() {
    return Promise.resolve(undefined)
  }

  /** @return {Promise} */
  sendToDevice() {
    return Promise.resolve(undefined)
  }

  /**
   * @param {object} requested - The requested capabilities
   * @return {Promise} The validated capabilities
   */
  validateCapabilities(requested) {
    return Promise.resolve(requested)
  }
}


/** Message types */
const EVENT_CLIENT_SELECTIONCHANGED_ELEMENTS = 'ai.bldrs-share.SelectionChanged'
const EVENT_CLIENT_MODEL_LOADED = 'ai.bldrs-share.ModelLoaded'
const EVENT_CLIENT_HIDDEN_ELEMENTS = 'ai.bldrs-share.HiddenElements'


document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('bldrs-widget-iframe')
  const bldrsWidget = new BldrsWidget()
  bldrsWidget.url = `${location.protocol}//${location.host}`
  const widget = new mxwidgets.Widget(bldrsWidget)
  const driver = new BldrsWidgetDriver()
  const api = new mxwidgets.ClientWidgetApi(widget, container, driver)

  const cbxIsReady = document.getElementById('cbxIsReady')
  const txtLastMsg = document.getElementById('txtLastMsg')
  const txtSendMessageType = document.getElementById('txtSendMessageType')
  const txtSendMessagePayload = document.getElementById('txtSendMessagePayload')
  const btnSendMessage = document.getElementById('btnSendMessage')

  const txtMessagesCount = document.getElementById('messagesCount')
  const txtLastMessageReceivedAction = document.getElementById('lastMessageReceivedAction')

  container.src = bldrsWidget.url

  api.on('ready', () => {
    cbxIsReady.checked = true
  })

  // api.on('action:' + EVENT_CLIENT_SELECT_ELEMENTS, (event) => {
  //   event.preventDefault()
  //   txtLastMsg.value = JSON.stringify(event.detail)
  //   api.transport.reply(event.detail, {})
  // })

  // api.on('action:' + EVENT_CLIENT_DESELECT_ELEMENTS, (event) => {
  //   event.preventDefault()
  //   txtLastMsg.value = JSON.stringify(event.detail)
  //   api.transport.reply(event.detail, {})
  // })

  // api.on('action:' + EVENT_CLIENT_SELECTIONCHANGED_ELEMENTS, (event) => {
  //   event.preventDefault()
  //   txtLastMsg.value = JSON.stringify(event.detail)
  //   api.transport.reply(event.detail, {})
  // })

  listenToApiAction(
    EVENT_CLIENT_SELECTIONCHANGED_ELEMENTS,
    (ev) => {
      debug().log('bldrs-inside-iframe#listenToApiAction, EVENT_CLIENT_SELECTIONCHANGED_ELEMENTS:', ev)
      txtLastMsg.value = JSON.stringify(ev.detail ?? '')
    },
  )

  listenToApiAction(
    EVENT_CLIENT_MODEL_LOADED,
    (ev) => {
      debug().log('bldrs-inside-iframe#listenToApiAction, EVENT_CLIENT_MODEL_LOADED:', ev)
      txtLastMsg.value = JSON.stringify(ev.detail ?? '')
    },
  )

  listenToApiAction(
    EVENT_CLIENT_HIDDEN_ELEMENTS,
    (ev) => {
      debug().log('bldrs-inside-iframe#listenToApiAction, EVENT_CLIENT_HIDDEN_ELEMENTS:', ev)
      txtLastMsg.value = JSON.stringify(ev.detail ?? '')
    },
  )

  btnSendMessage.addEventListener('click', () => {
    const messageType = txtSendMessageType.value
    const messagePayload = JSON.parse(txtSendMessagePayload.value)
    api.transport.send(messageType, messagePayload)
  })

  let messagesReceivedCount = 0

  /**
   * @param {string} actionName - The action name to listen for
   * @param {Function} callback - Callback function to execute
   */
  function listenToApiAction(actionName, callback) {
    api.on(`action:${actionName}`, (e) => {
      debug().log('bldrs-inside-iframe#listenToApiAction, event:', e)
      if (e.type === 'DOMContentLoaded') {
        debug().log('bldrs-inside-iframe#listenToApiAction, ignoring event of type DOMContentLoaded')
        return
      }
      e.preventDefault()
      messagesReceivedCount++
      if (callback) {
        callback(e)
      }
      api.transport.reply(e.detail, {})
      txtMessagesCount.innerText = messagesReceivedCount
      txtLastMessageReceivedAction.innerText = e.detail.action
    })
  }
})
