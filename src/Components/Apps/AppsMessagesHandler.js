import useStore from '../../store/useStore'


/** */
export class IFrameCommunicationChannel {
  channel = null
  port1 = null
  iframe = null

  /**
   * constructor must be called after the iframe is loaded
   *
   * @param {object} iframe the iframe html element
   */
  constructor(iframe) {
    /* Step 1 : Message channel is created */
    this.channel = new MessageChannel()
    this.port1 = this.channel.port1
    /* Step 2: Using the copy of port1 */
    // Hooking up onMessage handler to receive messages from iframe,
    // listening to mesages on port1.
    this.port1.onmessage = this.messageHandler
    /* Step 3: Sending out the port2 on load */
    // Transfer port2 to the iframe
    iframe.contentWindow.postMessage('init', iframe.src, [this.channel.port2])
    this.iframe = iframe
  }

  /**
   * Handle incoming messages from the iframe through the MessageChannel
   *
   * @param {*} event the data received from the iframe
   */
  messageHandler = (event) => {
    switch (event.data) {
    case 'getLoadedFile':
      this.sendMessage(event.data, useStore.getState().loadedFileInfo)
      break
    case 'getSelectedElements':
      this.sendMessage(event.data, useStore.getState().selectedElements)
      break
    default:
      break
    }
  }

  /**
   * Send any kind of data to the iframe through the MessageChannel
   *
   * @param {*} data the data to be sent to the iframe
   */
  sendMessage = (action, response) => {
    this.port1.postMessage({action, response})
  }
}

