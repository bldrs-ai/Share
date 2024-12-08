import React, {ReactElement, useCallback} from 'react'
import Box from '@mui/material/Box'
import {IFrameCommunicationChannel} from './AppsMessagesHandler'


/**
 * @property {object} itemJson App description json
 * @return {ReactElement}
 */
export default function AppIFrame({itemJson}) {
  const appFrameRef = useCallback((elt) => {
    if (elt) {
      elt.addEventListener('load', () => {
        new IFrameCommunicationChannel(elt)
      })
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
