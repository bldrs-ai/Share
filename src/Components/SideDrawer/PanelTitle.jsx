import React, {ReactElement} from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import {assertDefined} from '../../utils/assert'


/**
 * @property {string} title Panel title
 * @property {object} [controlsGroup] Controls Group is placed on the right of the title
 * @property {string} [iconSrc] url to an image to be used to prepend and icon to the title
 * @return {ReactElement}
 */
export default function PanelTitle({title, controlsGroup, iconSrc}) {
  assertDefined(title)
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '70px',
      }}
      data-test-id='PanelTitle'
    >
      <Box sx={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
      data-test-id='PanelTitleIconText'
      >
        {iconSrc ?
          <img style={{
            width: '32px',
            height: '32px',
            margin: '0.5em',
          }} src={iconSrc} alt={title}
          /> : <></>
        }
        <Typography variant='body1' data-testid={'panelTitle'}>
          {title}
        </Typography>
      </Box>
      {controlsGroup}
    </Box>
  )
}
