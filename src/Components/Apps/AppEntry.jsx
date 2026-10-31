import React, {ReactElement} from 'react'
import {Card, CardActionArea, CardActions, CardContent, CardMedia, IconButton, Paper, Typography} from '@mui/material'
import {PushPin as PushPinIcon, PushPinOutlined as PushPinOutlinedIcon} from '@mui/icons-material'


/**
 * @property {object} itemJson App description json
 * @property {Function} onClickCb Called when app's card is clicked
 * @property {boolean} [isPinned] Whether the app is pinned to the Apps bar
 * @property {Function} [onTogglePin] Pin / unpin it; no pin control when absent
 * @return {ReactElement}
 */
export default function AppEntry({itemJson, onClickCb, isPinned = false, onTogglePin}) {
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
        {/* Pinned apps stay on the workspace Apps bar across reloads
            (#1993); filled pin when pinned, outlined when not. */}
        {onTogglePin &&
         <CardActions sx={{justifyContent: 'flex-end'}}>
           <IconButton
             aria-label={isPinned ? `Unpin ${itemJson.appName}` : `Pin ${itemJson.appName} to the Apps bar`}
             aria-pressed={isPinned}
             onClick={onTogglePin}
             data-testid={`app-pin-${itemJson.appName}`}
           >
             {isPinned ? <PushPinIcon className='icon-share'/> : <PushPinOutlinedIcon className='icon-share'/>}
           </IconButton>
         </CardActions>}
      </Card>
    </Paper>
  )
}
