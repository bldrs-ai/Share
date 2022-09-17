/*
Copyright 2020 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the 'License');
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an 'AS IS' BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

let widgetId = null // to be populated on the first `toWidget` request.

// First we need to set up a listener to ensure we're able to hear the client's requests
window.addEventListener('message', (event) => {
  // First make sure we are roughly in shape to be a widget: we need a parent window to
  // make sure it's not another tab trying to contact us.
  if (!window.parent) {
    return
  }

  // Next we validate to make sure the request is a valid shape
  const request = event.data
  if (!request) {
    return
  }
  if (!request['requestId'] || !request['widgetId'] || !request['action']) {
    return
  }
  if (request['api'] !== 'toWidget') {
    return
  }

  console.log('Widget: legit request')
  // Now we see if it is for us, if we know what our widget ID is
  if (widgetId) {
    if (widgetId !== request['widgetId']) return
  } else {
    widgetId = request['widgetId']
    console.log('Got widget id:', widgetId)
  }

  // Finally, we can get on to the action handling.
  if (request['action'] === 'capabilities') {
    // We're going to respond with the capabilities we want: m.sticker
    window.parent.postMessage({
      ...request, // include the original request
      response: {
        capabilities: ['m.sticker'],
      },
    }, event.origin)
  } else {
    // We'll send an error response for this. Ideally we'd do a full implementation
    // of the widget API, but that is out of scope for this tutorial.
    window.parent.postMessage({
      ...request, // include the original request
      response: {
        error: {
          message: 'Action not supported',
        },
      },
    }, event.origin)
  }
})

// This is where we register our stickers. The HTML calls sendSticker() with the ID
// of the sticker to send, which is the key of this object. The value of the object
// is simply StickerActionRequestData which gets placed in the request.
const stickers = {
  'normal': {
    name: 'Made for Matrix badge',
    content: {
      url: 'mxc://matrix.org/AFdISYOGCRXUIJejgxeRxaEg',
      info: {
        w: 256,
        h: 256,
        mimetype: 'image/png',
      },
    },
  },
  'inverted': {
    name: 'Made for Matrix badge (inverted)',
    content: {
      url: 'mxc://matrix.org/wKGtfcEVxrUFXbbipBzfvfpD',
      info: {
        w: 256,
        h: 256,
        mimetype: 'image/png',
      },
    },
  },
}


/**
 * @param {string} id
 */
function sendSticker(id) {
  // First, see if we forgot to register the sticker
  const sticker = stickers[id]
  if (!sticker) {
    console.warn('Error: unknown sticker')
    return
  }

  // Now create and send a request to the client to send a sticker
  window.parent.postMessage({
    api: 'fromWidget', // because we're sending from the widget
    action: 'm.sticker', // we want to send a sticker
    requestId: `sticker-${Date.now()}`, // we'll use the current time to make a unique request ID
    widgetId: widgetId, // include our widget ID
    data: sticker, // send the sticker request body
  }, '*')

  // Note: We post to '*' as an origin because we don't have a reliable origin to
  // get access to (browsers think that `window.parent.location.origin` is cross-origin and do
  // not let us see it).
}
