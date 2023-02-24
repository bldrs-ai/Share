import React from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Grid from '@mui/material/Unstable_Grid2'
import Typography from '@mui/material/Typography'
import useTheme from '@mui/styles/useTheme'
import useStore from '../../store/useStore'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardMedia from '@mui/material/CardMedia'
import {CardActionArea} from '@mui/material'


const StoreData = [
  {
    appName: 'vyzn',
    description: 'Perform environemental analysis on your model',
    image: 'https://www.vyzn.tech/wp-content/themes/stuiq-base/assets/images/logo.svg',
    action: 'http://127.0.0.1:5501/',
  },
  // {
  //   appName: 'vyzn',
  //   description: 'Perform environemental analysis on your model',
  //   image: 'https://www.vyzn.tech/wp-content/themes/stuiq-base/assets/images/logo.svg',
  //   action: 'http://127.0.0.1:5500/#/?widgetId=bldrs-share&userId=ai.bldrs-share',
  // },
  // {
  //   appName: 'vyzn',
  //   description: 'Perform environemental analysis on your model',
  //   image: 'https://www.vyzn.tech/wp-content/themes/stuiq-base/assets/images/logo.svg',
  //   action: 'http://127.0.0.1:5500/#/?widgetId=bldrs-share&userId=ai.bldrs-share',
  // },
  // {
  //   appName: 'vyzn',
  //   description: 'Perform environemental analysis on your model',
  //   image: 'https://www.vyzn.tech/wp-content/themes/stuiq-base/assets/images/logo.svg',
  //   action: 'http://127.0.0.1:5500/#/?widgetId=bldrs-share&userId=ai.bldrs-share',
  // },
]
/** @return {React.Component} */
export function AppStoreListing() {
  const theme = useTheme()
  const setSelectedStoreApp = useStore((state) => state.setSelectedStoreApp)
  return (
    <>
      <Grid container spacing={2}>
        {StoreData.map((item, index) => (
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
  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      width: '100%',
      height: '100%',
    }}
    >
      <iframe id='app-host' title={item.name} src={item.action} width='100%' height='100%'/>
    </Box>
  )
}
