import React, {ReactElement} from 'react'
import {Grid} from '@mui/material'
import useStore from '../../store/useStore'
import AppEntry from './AppEntry'
import AppsRegistry from './AppsRegistry.json'


/** @return {ReactElement} */
export default function AppsListing() {
  const setSelectedApp = useStore((state) => state.setSelectedApp)
  const pinnedAppNames = useStore((state) => state.pinnedAppNames)
  const togglePinnedApp = useStore((state) => state.togglePinnedApp)
  return (
    <Grid container spacing={1}>
      {AppsRegistry.map((itemJson, index) => (
        <Grid key={index}>
          <AppEntry
            onClickCb={() => setSelectedApp(itemJson)}
            itemJson={itemJson}
            isPinned={pinnedAppNames.includes(itemJson.appName)}
            onTogglePin={() => togglePinnedApp(itemJson.appName)}
          />
        </Grid>
      ))}
    </Grid>
  )
}
