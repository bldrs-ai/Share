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
          color: theme.palette.primary.main,
        },
        '.MuiSvgIcon-root': {
          // Mui icons use 'color' instead of 'fill'
          color: theme.palette.primary.contrastText,
        },
        '.MuiDialog-paper': {
          textAlign: 'center',
          padding: '0.5em',
        },
        '.MuiDialog-paper > .MuiButtonBase-root': {
          position: 'absolute',
          top: 0,
          right: 0,
          margin: '0.5em',
          opacity: .5,
        },
        '.MuiDialogActions-root': {
          textAlign: 'center',
        },
        '.MuiDialogActions-root > .MuiButtonBase-root': {
          marginLeft: 'auto',
          marginRight: 'auto',
        },
        '.icon-share': {
          width: '20px',
          height: '20px',
          fill: theme.palette.primary.contrastText,
        },
        '.icon-small': {
          width: '15px',
          height: '15px',
        },
        'hr.MuiDivider-root': {
          padding: '0.5em 0',
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
      }}
    />
  )
}
