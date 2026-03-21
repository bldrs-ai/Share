import React, {ReactElement} from 'react'
import {Box, ButtonBase, Tooltip, Typography} from '@mui/material'
import {useTheme} from '@mui/material/styles'


/**
 * Compact app entry — small icon with name, description on hover.
 *
 * @property {object} itemJson App description json
 * @property {Function} onClickCb Called when clicked
 * @return {ReactElement}
 */
export default function AppEntry({itemJson, onClickCb}) {
  const theme = useTheme()
  return (
    <Tooltip title={itemJson.description} placement='left' arrow>
      <ButtonBase
        onClick={onClickCb}
        sx={{
          'display': 'flex',
          'alignItems': 'center',
          'gap': '0.6rem',
          'width': '100%',
          'padding': '0.5rem 0.75rem',
          'borderRadius': '6px',
          'textAlign': 'left',
          'transition': 'background 0.15s',
          '&:hover': {
            background: theme.palette.action.hover,
          },
        }}
        data-testid={`AppEntry-${itemJson.appName}`}
      >
        <Box
          component='img'
          src={itemJson.icon}
          alt={itemJson.appName}
          sx={{
            width: 28,
            height: 28,
            flexShrink: 0,
            objectFit: 'contain',
          }}
        />
        <Typography variant='body2' sx={{fontWeight: 500}}>
          {itemJson.appName}
        </Typography>
      </ButtonBase>
    </Tooltip>
  )
}
