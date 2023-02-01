import React from 'react'
import GlobalStyles from '@mui/material/GlobalStyles'


/**
 * @property {object} theme To set link, icon and scollbar colors.
 * @return {React.Component}
 */
export default function Styles({theme}) {
  return (
    <GlobalStyles
      styles={{
        'body': {
          overscrollBehavior: 'none',
          overflow: 'hidden',
          padding: 0,
          height: '100%',
          maxHeight: '100%',
        },
        'a': {
          color: theme.palette.secondary.contrastText,
        },
        'svg': {
          width: '18px',
          height: '18px',
          fill: theme.palette.primary.contrastText,
        },
        '.closeButton': {
          width: '12px',
          height: '12px',
        },
        '.caretToggle': {
          width: '12px',
          height: '12px',
        },
        '*::-webkit-scrollbar': {
          width: '10px',
          background: theme.palette.secondary.background,
        },
        '*::-webkit-scrollbar-thumb': {
          backgroundColor: theme.palette.secondary.main,
        },
      }}
    />
  )
}
