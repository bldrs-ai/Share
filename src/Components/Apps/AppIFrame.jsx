import React, {ReactElement, useCallback} from 'react'
import {Box} from '@mui/material'
import useStore from '../../store/useStore'
import {IFrameCommunicationChannel} from './AppsMessagesHandler'


/**
 * @property {object} itemJson App description json
 * @return {ReactElement}
 */
export default function AppIFrame({itemJson}) {
  const appPrefix = useStore((state) => state.appPrefix)
  // Resolve widget URL relative to the site root, not the current page
  const basePath = appPrefix ? appPrefix.replace(/\/share$/, '/') : '/'
  const iframeSrc = itemJson.action.startsWith('http') ?
    itemJson.action :
    `${basePath}${itemJson.action}`

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
        title={itemJson.appName}
        src={iframeSrc}
        width='100%'
        height='100%'
      />
    </Box>
  )
}
