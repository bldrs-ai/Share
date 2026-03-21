import React, {ReactElement} from 'react'
import {Box, ButtonBase, Typography} from '@mui/material'
import {useTheme} from '@mui/material/styles'


/**
 * Compact app entry — icon + name + description in a single row.
 *
 * @property {object} itemJson App description json
 * @property {Function} onClickCb Called when clicked
 * @return {ReactElement}
 */
export default function AppEntry({itemJson, onClickCb}) {
  const theme = useTheme()
  return (
    <ButtonBase
      onClick={onClickCb}
      sx={{
        'display': 'flex',
        'alignItems': 'center',
        'gap': '0.75rem',
        'width': '100%',
        'padding': '0.6rem 0.75rem',
        'borderRadius': '4px',
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
          width: 32,
          height: 32,
          flexShrink: 0,
          objectFit: 'contain',
        }}
      />
      <Box sx={{minWidth: 0}}>
        <Typography variant='body2' sx={{fontWeight: 600, lineHeight: 1.3}}>
          {itemJson.appName}
        </Typography>
        <Typography
          variant='caption'
          sx={{
            color: 'text.secondary',
            display: 'block',
            lineHeight: 1.3,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {itemJson.description}
        </Typography>
      </Box>
    </ButtonBase>
  )
}
