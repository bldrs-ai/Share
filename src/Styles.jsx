import React, {Fragment} from 'react'
import GlobalStyles from '@mui/material/GlobalStyles'


/**
 * @property {object} theme To set link, icon and scrollbar colors.
 * @return {React.Component}
 */
export default function Styles({theme}) {
  // For performance
  // See https://mui.com/material-ui/customization/how-to-customize/#4-global-css-override
  const globalStyles = (
    <GlobalStyles
      styles={{
        'body': {
          overscrollBehavior: 'none',
          overflow: 'hidden',
          padding: 0,
          height: '100%',
          maxHeight: '100%',
        },
        '@media (max-width: 768px)': {
          html: {
            height: '100%',
            maxHeight: '100%',
            overflow: 'hidden',
            overscrollBehavior: 'none',
          },
          body: {
            position: 'fixed',
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            maxHeight: '100%',
          },
        },
        'a': {
          color: theme.palette.primary.main,
        },
        '.no-select': {
          userSelect: 'none',
        },
        '.icon-share': {
          width: '40px',
          height: '40px',
          fill: theme.palette.primary.contrastText,
        },
        '.icon-small': {
          width: '15px',
          height: '15px',
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
  return <Fragment>{globalStyles}</Fragment>
}
