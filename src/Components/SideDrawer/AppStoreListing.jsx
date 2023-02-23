import React from 'react'
import Box from '@mui/material/Box'
import {Grid} from '@mui/material'
import Typography from '@mui/material/Typography'
import useTheme from '@mui/styles/useTheme'
import {useIsMobile} from '../Hooks'
import useStore from '../../store/useStore'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardMedia from '@mui/material/CardMedia'
import {CardActionArea} from '@mui/material'


const StoreData = [
  {
    AppName: 'vyzn',
    Description: 'Perform environemental analysis on your model',
    Image: 'https://www.vyzn.tech/wp-content/themes/stuiq-base/assets/images/logo.svg',
  },
  {
    AppName: 'vyzn',
    Description: 'Perform environemental analysis on your model',
    Image: 'https://www.vyzn.tech/wp-content/themes/stuiq-base/assets/images/logo.svg',
  },
  {
    AppName: 'vyzn',
    Description: 'Perform environemental analysis on your model',
    Image: 'https://www.vyzn.tech/wp-content/themes/stuiq-base/assets/images/logo.svg',
  },
  {
    AppName: 'vyzn',
    Description: 'Perform environemental analysis on your model',
    Image: 'https://www.vyzn.tech/wp-content/themes/stuiq-base/assets/images/logo.svg',
  },
]
/** @return {React.Component} */
export function AppStoreListing() {
  return (
    <>
      <Grid container spacing={3}>
        {StoreData.map((item, index) => (
          <Grid xs={6} sm={6} md={6} key={index}>
            <AppStoreEntry name={item.AppName} img={item.Image} description={item.Description}/>
          </Grid>
        ))}
      </Grid>
    </>
  )
}


/** @return {React.Component} */
export function AppStoreEntry({
  name,
  img,
  description,
}) {
  return (
    <Card gutterBottom>
      <CardActionArea>
        <CardMedia
          component="img"
          height="140"
          image={img}
          alt={name}
        />
        <CardContent>
          <Typography gutterBottom variant="h5" component="div">
            {name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {description}
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>

  )
}

/** @return {React.Component} */
export function AppStoreIFrame() {
    return (<></>)
}

