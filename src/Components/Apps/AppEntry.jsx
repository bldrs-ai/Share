import React, {ReactElement} from 'react'
import {Card, CardActionArea, CardContent, CardMedia, Paper, Typography} from '@mui/material'


/**
 * @property {object} itemJson App description json
 * @property {Function} onClickCb Called when app's card is clicked
 * @return {ReactElement}
 */
export default function AppEntry({itemJson, onClickCb}) {
  return (
    <Paper>
      <Card>
        <CardActionArea onClick={onClickCb}>
          <CardMedia
            component='img'
            height='140px'
            image={itemJson.image}
            alt={itemJson.name}
            sx={{
              objectFit: 'unset',
              background: '#f0f0f0',
              padding: '1em',
            }}
          />
          <CardContent>
            <Typography variant='body1' component='div'>
              {itemJson.name}
            </Typography>
            <Typography variant='body2'>
              {itemJson.description}
            </Typography>
          </CardContent>
        </CardActionArea>
      </Card>
    </Paper>
  )
}
