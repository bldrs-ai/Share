/**
 * The Bldrs widget.
 */
class BldrsWidget {
    creatorUserId = 'ai.bldrs-share';
    id = 'bldrs-share';
    type ='m.custom';
    url = null;
    waitForIframeLoad = false;
}

/**
 * The Bldrs Widget Driver.
 */
class BldrsWidgetDriver {
    askOpenID(observer) {
      // not implemented yet
    }
  
    getTurnServers() {
      return undefined;
    }
  
    navigate(uri){
      return Promise.resolve(undefined);
    }
  
    // NOSONAR
    readEventRelations(
      eventId,
      roomId,
      relationType,
      eventType,
      from,
      to,
      limit,
      direction
    ) {
      return Promise.resolve(undefined);
    }
  
    readRoomEvents(eventType, msgtype, limit, roomIds) {
      return Promise.resolve([]);
    }
  
    readStateEvents(eventType, stateKey, limit, roomIds) {
      return Promise.resolve([]);
    }
  
    sendEvent(eventType, content, stateKey, roomId) {
      return Promise.resolve(undefined);
    }
  
    sendToDevice(eventType, encrypted, contentMap) {
      return Promise.resolve(undefined);
    }
  
    validateCapabilities(requested) {
      return Promise.resolve(requested);
    }
}

/**
 * Message types.
 */
const EVENT_VIEWER_LOAD_MODEL = 'ai.bldrs-share.LoadModel';
const EVENT_VIEWER_SELECT_ELEMENTS = 'ai.bldrs-share.SelectElements';
const EVENT_CLIENT_SELECT_ELEMENTS = 'ai.bldrs-share.ElementsSelected';
const EVENT_CLIENT_DESELECT_ELEMENTS = 'ai.bldrs-share.ElementsDeSelected';

document.addEventListener("DOMContentLoaded", function(event) { 
  const container = document.getElementById('bldrs-widget-iframe');
  const bldrsWidget = new BldrsWidget();
  bldrsWidget.url = location.protocol + '//' + location.host;
  const widget = new mxwidgets.Widget(bldrsWidget);
  const driver = new BldrsWidgetDriver();
  const api = new mxwidgets.ClientWidgetApi(widget, container, driver);

  const cbxIsReady = document.getElementById('cbxIsReady');
  const txtLastMsg = document.getElementById('txtLastMsg');
  const txtSendMessageType = document.getElementById('txtSendMessageType');
  const txtSendMessagePayload = document.getElementById('txtSendMessagePayload');
  const btnSendMessage = document.getElementById('btnSendMessage');

  container.src = bldrsWidget.url;
  
  api.on('ready', () => {
    cbxIsReady.checked = true;
    console.log("message: ready");
  });
  
  api.on('action:' + EVENT_CLIENT_SELECT_ELEMENTS, (event) => {
    event.preventDefault();
    txtLastMsg.value = JSON.stringify(event.detail)
    api.transport.reply(event.detail, {});
  });
  
  api.on('action:' + EVENT_CLIENT_DESELECT_ELEMENTS, (event) => {
    event.preventDefault();
    txtLastMsg.value = JSON.stringify(event.detail)
    api.transport.reply(event.detail, {});
  });
  
  btnSendMessage.addEventListener('click', () => {
    const messageType = txtSendMessageType.value
    const messagePayload = JSON.parse(txtSendMessagePayload.value)
    api.transport.send(messageType, messagePayload);
  })
  
});


