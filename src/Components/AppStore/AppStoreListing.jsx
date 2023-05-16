import React, {useCallback} from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Grid from '@mui/material/Unstable_Grid2'
import Typography from '@mui/material/Typography'
import useStore from '../../store/useStore'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardMedia from '@mui/material/CardMedia'
import {CardActionArea} from '@mui/material'
import {IFrameCommunicationChannel} from './AppStoreMessagesHandler'
import AppStoreData from './AppStoreData.json'


/** @return {React.Component} */
export function AppStoreListing() {
  const setSelectedStoreApp = useStore((state) => state.setSelectedStoreApp)
  return (
    <>
      <Grid container spacing={2}>
        {AppStoreData.map((item, index) => (
          <Grid item={true} xs={6} sm={6} md={6} key={index}>
            <AppStoreEntry
              clickHandler={setSelectedStoreApp}
              item={item}
            />
          </Grid>
        ))}
      </Grid>
    </>
  )
}


/** @return {React.Component} */
export function AppStoreEntry({
  item,
  clickHandler,
}) {
  return (
    <Paper>
      <Card>
        <CardActionArea onClick={() => {
          clickHandler(item)
        }}
        >
          <CardMedia
            component="img"
            height="140"
            image={item.image}
            alt={item.name}
            sx={{
              objectFit: 'unset',
              background: '#f0f0f0',
              padding: '1em',
            }}
          />
          <CardContent>
            <Typography variant="h5" component="div">
              {item.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {item.description}
            </Typography>
          </CardContent>
        </CardActionArea>
      </Card>
    </Paper>
  )
}

/** @return {React.Component} */
export function AppStoreIFrame({
  item,
}) {
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
        title={item.name}
        src={item.action}
        width='100%'
        height='100%'
      />
    </Box>
  )
}
