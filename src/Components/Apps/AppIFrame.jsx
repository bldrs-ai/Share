import React, {ReactElement, useEffect, useRef} from 'react'
import Box from '@mui/material/Box'
import {IFrameCommunicationChannel} from './AppsMessagesHandler'

export default function AppIFrame({itemJson}) {
  const appFrameRef = useRef(null) // Use useRef for a stable reference to the iframe element.

  useEffect(() => {
    const iframeEl = appFrameRef.current
    if (!iframeEl) {
      return
    }

    const handleMessage = (event) => {
      // Security: Ensure the message is from our iframe's contentWindow.
      if (event.source !== iframeEl.contentWindow) {
        return
      }

      // Check if the applet is requesting the communication channel.
      if (event.data === 'request-channel') {
        console.log("Share: Received 'request-channel' from applet. Sending back port.");
        // Create the channel and send the 'init' message, as before.
        new IFrameCommunicationChannel(iframeEl)
      }
    }

    // Listen for messages from any origin, but verify the source above.
    window.addEventListener('message', handleMessage)

    // Cleanup: remove the listener when the component unmounts.
    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, []) // The empty dependency array means this effect runs once on mount.


  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      width: '100%',
      height: '100%',
    }}
    >
      <iframe
        ref={appFrameRef} // Attach the ref to the iframe element.
        title={itemJson.name}
        src={itemJson.action}
        width='100%'
        height='100%'
        credentialless
        allow="cross-origin-isolated"
      />
    </Box>
  )
}