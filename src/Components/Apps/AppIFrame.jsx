import React, {ReactElement, useCallback, useRef} from 'react'
import {Box} from '@mui/material'
import {IFrameCommunicationChannel} from './AppsMessagesHandler'


/**
 * @property {object} itemJson App description json
 * @return {ReactElement}
 */
export default function AppIFrame({itemJson}) {
  const channelRef = useRef(null)

  const appFrameRef = useCallback((elt) => {
    if (!elt) {
      // Cleanup on unmount
      if (channelRef.current) {
        channelRef.current.dispose()
        channelRef.current = null
      }
      return
    }
    const onLoad = () => {
      if (channelRef.current) {
        channelRef.current.dispose()
      }
      channelRef.current = new IFrameCommunicationChannel(elt)
    }
    elt.addEventListener('load', onLoad)
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
