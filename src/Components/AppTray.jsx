import React, {useCallback, useState} from 'react'


/**
 * @return {object} React component
 */
export default function AppTray() {
  const [frameSource, setFrameSource] = useState('/widget/stickerpicker.html')
  const appFrameRef = useCallback((elt) => {
    if (elt) {
      initMatrix(elt)
    }
  }, [])


  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: '0.5em',
          right: '5em',
          width: '60em',
        }}
      >
        <form name='appFrame' onSubmit={(e) => {
          e.preventDefault()
          setFrameSource(document.forms.appFrame.children.frameSource.value)
        }}
        >
          IFrame source: <input name='frameSource' defaultValue={frameSource} width='20'/>
        </form>
        <iframe
          ref={appFrameRef}
          title='App IFrame'
          src={frameSource}
          style={{
            border: 'solid 3px red',
            width: '60em',
            height: '40em',
          }}
        ></iframe>
      </div>
    </>
  )
}


/**
 * @param {boolean} invalid
 * @param {msg} msg
 */
function check(invalid, msg) {
  if (invalid) {
    throw new Error(msg)
  }
}


/** */
function initMatrix(iframe) {
  // First we need to set up a listener to ensure we're able to hear the client's requests
  window.addEventListener('message', (event) => {
    // First make sure we are roughly in shape to be a widget: we need a parent window to
    // make sure it's not another tab trying to contact us.
    check(!window.parent, 'request not from parent; ignoring')

    // Next we validate to make sure the request is a valid shape
    const request = event.data
    check(!request, 'Event missing request')
    check(request['api'] !== 'fromWidget', 'Request not from widget')
    check(!request['requestId'], 'Request missing requestId')
    check(!request['action'], 'Request missing action')

    console.log('AppTray.jsx, legit event', event)

    const widgetId = 1
    if (request['widgetId'] === null) {
      console.log('AppTray: assigning widget ID')
      window.parent.postMessage({
        ...request, // include the original request
        response: {
          action: 'capabilities',
          widgetId,
        },
      }, event.origin)
    } else if (request['capabilities'] === 'capabilities') {
      console.log('GOT A CAPABLE APP:', request)
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


  // console.log('AppTray.jsx, sending initial message')
  // window.parent.postMessage({action: 'capabilities'})
}
