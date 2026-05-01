import React, {ReactElement, useCallback, useEffect, useRef} from 'react'
import {Box} from '@mui/material'
import {IFrameCommunicationChannel} from './AppsMessagesHandler'


/**
 * @property {object} itemJson App description json
 * @return {ReactElement}
 */
export default function AppIFrame({itemJson}) {
  const channelRef = useRef(null)

  const appFrameRef = useCallback((elt) => {
    // Dispose any prior channel before creating a new one or before
    // the iframe element detaches.
    if (channelRef.current) {
      channelRef.current.dispose()
      channelRef.current = null
    }
    if (!elt) {
      return
    }
    elt.addEventListener('load', () => {
      if (channelRef.current) {
        channelRef.current.dispose()
      }
      channelRef.current = new IFrameCommunicationChannel(elt)
    })
  }, [])

  useEffect(() => {
    return () => {
      if (channelRef.current) {
        channelRef.current.dispose()
        channelRef.current = null
      }
    }
  }, [])

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
        ref={appFrameRef}
        title={itemJson.name}
        src={itemJson.action}
        width='100%'
        height='100%'
      />
    </Box>
  )
}
