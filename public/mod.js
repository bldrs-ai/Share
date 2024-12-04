const {ClientWidgetApi, PostmessageTransport} = mxwidgets()


/** @param {string} msg */
function log(msg) {
  const logElt = document.getElementById('logItems')
  logElt.innerHTML += `<li>${msg}</li>`
}

// Define the widget configuration
const widget = {
  id: 'bldrs-share',
  name: 'Embedded Share App',
  type: 'm.custom',
  url: 'https://example.com/widget',
  creatorUserId: '@user:matrix.org',
  origin: '*',
}

// Reference the iframe element
const iframe = document.getElementById('share-app')

// Create a PostmessageTransport driver
const driver = new PostmessageTransport(window, iframe.contentWindow)

// Instantiate the ClientWidgetApi
const clientWidgetApi = new ClientWidgetApi(widget, iframe, driver)

console.log('clientWidgetApi', clientWidgetApi)

clientWidgetApi.on('ready', () => {
  console.log('ON READY')
  clientWidgetApi.updateVisibility(true).then(() => console.log('Widget knows it is visible now'))
  // clientWidgetApi.transport.send('com.example.my_action', {isExample: true})
})

/** @param {string} eventName */
function register(eventName, cb) {
  console.log('registering:', eventName)
  clientWidgetApi.on(`action:ai.bldrs-share.${eventName}`, (event) => {
    cb(eventName, event)
    // clientWidgetApi.transport.reply(event, {success: true, response: 'Acknowledged!'})
  })
}

const events = [
  'ChangeViewSettings',
  'HiddenElements',
  'ModelLoaded',
  'ChangeViewSettings',
  'LoadModel',
  'HighlightElements',
  'SelectElements',
  'UnhideElements',
  'HideElements',
]
events.forEach((name) => {
  register(name, (eventName, e) => console.log(`HANDLER ON ${eventName}:`, e.detail))
})

register('SelectionChanged', (eventName, e) => {
  const data = e.detail.data
  const currentSelection = data.current[0]
  log(`GUID: ${currentSelection}`)
})
