import React, {Component, useCallback} from 'react'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import CardMedia from '@mui/material/CardMedia'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Grid from '@mui/material/Unstable_Grid2'
import useStore from '../../store/useStore'
import AppsRegistry from './AppsRegistry.json'
import {IFrameCommunicationChannel} from './AppsMessagesHandler'


console.warn('AppsRegistry', AppsRegistry)

/** @return {Component} */
export function AppsListing() {
  const setSelectedApp = useStore((state) => state.setSelectedApp)
  return (
    <>
      <Grid container spacing={1}>
        {AppsRegistry.map((item, index) => (
          <Grid item={true} xs={6} sm={6} md={6} key={index}>
            <AppsEntry
              clickHandler={setSelectedApp}
              item={item}
            />
          </Grid>
        ))}
      </Grid>
    </>
  )
}


/** @return {Component} */
function AppsEntry({item, clickHandler}) {
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
            <Typography variant="body1" component="div">
              {item.name}
            </Typography>
            <Typography variant="body2">
              {item.description}
            </Typography>
          </CardContent>
        </CardActionArea>
      </Card>
    </Paper>
  )
}

/** @return {Component} */
export function AppIFrame({
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
