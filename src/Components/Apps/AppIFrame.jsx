import React, {ReactElement, useCallback, useRef} from 'react'
import {Box} from '@mui/material'
import useStore from '../../store/useStore'
import {IFrameCommunicationChannel} from './AppsMessagesHandler'


/**
 * @property {object} itemJson App description json
 * @return {ReactElement}
 */
export default function AppIFrame({itemJson}) {
  const appPrefix = useStore((state) => state.appPrefix)
  const basePath = appPrefix ? appPrefix.replace(/\/share$/, '/') : '/'
  const iframeSrc = itemJson.action.startsWith('http') ?
    itemJson.action :
    `${basePath}${itemJson.action}`

  const channelRef = useRef(null)

  const appFrameRef = useCallback((elt) => {
    // Dispose previous channel
    if (channelRef.current) {
      channelRef.current.dispose()
      channelRef.current = null
    }
    if (!elt) {
      return
    }
    elt.addEventListener('load', () => {
      if (channelRef.current) channelRef.current.dispose()
      channelRef.current = new IFrameCommunicationChannel(elt)
    })
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
        title={itemJson.appName}
        src={iframeSrc}
        width='100%'
        height='100%'
        style={{border: 'none'}}
      />
    </Box>
  )
}
