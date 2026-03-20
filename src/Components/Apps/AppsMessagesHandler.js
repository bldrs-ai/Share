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
    iframe.contentWindow.postMessage('init', '*', [this.channel.port2])
    this.iframe = iframe

    // Push selection changes to the iframe
    let prevSelectedElement = useStore.getState().selectedElement
    this.unsubscribe = useStore.subscribe(() => {
      const selectedElement = useStore.getState().selectedElement
      if (selectedElement !== prevSelectedElement) {
        prevSelectedElement = selectedElement
        const globalId = selectedElement?.GlobalId?.value ?? selectedElement?.GlobalId ?? null
        this.sendMessage('selectionChanged', globalId)
      }
    })
  }

  /**
   * Handle incoming messages from the iframe through the MessageChannel
   *
   * @param {*} event the data received from the iframe
   */
  messageHandler = async (event) => {
    switch (event.data) {
      case 'getLoadedFile':
        this.sendMessage(event.data, useStore.getState().loadedFileInfo)
        break
      case 'getFileData':
        await this.handleGetFileData()
        break
      case 'getSelectedElements':
        this.sendMessage(event.data, useStore.getState().selectedElements)
        break
      default:
        break
    }
  }

  /**
   * Send the loaded model's raw bytes through the channel.
   * Uses the OPFS-cached File when available, falls back to fetch.
   */
  async handleGetFileData() {
    try {
      // Prefer the OPFS-cached file — works for all sources (upload, GitHub, local)
      const opfsFile = useStore.getState().opfsFile
      if (opfsFile && opfsFile.size > 0) {
        const buffer = await opfsFile.arrayBuffer()
        this.port1.postMessage(
          {action: 'getFileData', response: buffer},
          [buffer],
        )
        return
      }

      // Fallback: fetch by URL
      const fileInfo = useStore.getState().loadedFileInfo
      if (!fileInfo || !fileInfo.info?.url) {
        this.sendMessage('getFileData', null)
        return
      }

      let url = fileInfo.info.url
      const u = new URL(url, window.location.origin)
      if (u.host === 'github.com') {
        u.hostname = 'raw.githubusercontent.com'
        u.host = 'raw.githubusercontent.com'
        url = u.toString()
      } else if (!url.startsWith('http')) {
        url = new URL(url, window.location.origin).href
      }

      const response = await fetch(url)
      if (!response.ok) {
        this.sendMessage('getFileData', null)
        return
      }
      const buffer = await response.arrayBuffer()
      this.port1.postMessage(
        {action: 'getFileData', response: buffer},
        [buffer],
      )
    } catch (err) {
      console.warn('[Apps] Failed to get file data:', err)
      this.sendMessage('getFileData', null)
    }
  }

  /**
   * Send any kind of data to the iframe through the MessageChannel
   *
   * @param {string} action - The action type
   * @param {*} response - The data to be sent to the iframe
   */
  sendMessage = (action, response) => {
    this.port1.postMessage({action, response})
  }
}

