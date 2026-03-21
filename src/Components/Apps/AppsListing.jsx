import React, {ReactElement} from 'react'
import {Box} from '@mui/material'
import useStore from '../../store/useStore'
import AppEntry from './AppEntry'
import AppsRegistry from './AppsRegistry.json'


/** @return {ReactElement} */
export default function AppsListing() {
  const setSelectedApp = useStore((state) => state.setSelectedApp)
  return (
    <Box sx={{display: 'flex', flexDirection: 'column', gap: '2px', padding: '0.25rem'}}>
      {AppsRegistry.map((itemJson, index) => (
        <AppEntry
          key={index}
          onClickCb={() => setSelectedApp(itemJson)}
          itemJson={itemJson}
        />
      ))}
    </Box>
  )
}
