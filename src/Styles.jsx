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
        '.MuiSvgIcon-root': {
          // Mui icons use 'color' instead of 'fill'
          color: theme.palette.primary.contrastText,
        },
        '.icon-share': {
          fill: theme.palette.primary.contrastText,
          width: '18px',
          height: '18px',
        },
        /* icon-nav-* are the sub-icons in NavTree */
        '.icon-nav-caret': {
          width: '12px',
          height: '12px',
        },
        '.icon-nav-eye': {
          width: '12px',
          height: '12px',
        },
        '.icon-nav-glasses': {
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
