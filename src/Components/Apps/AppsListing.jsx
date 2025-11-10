import React, {ReactElement} from 'react'
import {Grid} from '@mui/material'
import useStore from '../../store/useStore'
import AppEntry from './AppEntry'
import AppsRegistry from './AppsRegistry.json'


/** @return {ReactElement} */
export default function AppsListing() {
  const setSelectedApp = useStore((state) => state.setSelectedApp)
  return (
    <Grid container spacing={1}>
      {AppsRegistry.map((itemJson, index) => (
        <Grid key={index}>
          <AppEntry
            onClickCb={() => setSelectedApp(itemJson)}
            itemJson={itemJson}
          />
        </Grid>
      ))}
    </Grid>
  )
}
