import React, {useContext} from 'react'
import Box from '@mui/material/Box'
import {useTheme} from '@mui/styles'
import {ColorModeContext} from '../../Context/ColorMode'
import CutPlaneIcon from '../../assets/2D_Icons/CutPlane.svg'
import ListIcon from '../../assets/2D_Icons/List.svg'
import NotesIcon from '../../assets/2D_Icons/Notes.svg'
import ShareIcon from '../../assets/2D_Icons/Share.svg'


/**
 * A miniature view of the App to show as a guide in the About dialog.
 *
 * @return {React.ReactElement}
 */
export default function AboutGuide() {
  const theme = useTheme()
  const colorMode = useContext(ColorModeContext)
  return (
    <Box
      sx={{
        width: '100%',
        height: '150px',
        fontSize: '0.8em',
        borderRadius: '5px',
        opacity: .8,
        marginTop: '10px',
        padding: '0.5em',
        color: theme.palette.primary.contrastText,
        backgroundColor: colorMode.isDay() ? '#E8E8E8' : '#4C4C4C',
      }}
    >
      <Box
        sx={{
          'float': 'right',
          '& svg': {
            width: '12px',
            height: '12px',
            verticalAlign: 'middle',
            lineHeight: '15px',
            fill: theme.palette.primary.contrastText,
          },
          '& div': {
            textAlign: 'right',
            verticalAlign: 'middle',
            whiteSpace: 'nowrap',
            lineHeight: '15px',
          },
        }}
      >
        <div>Share models → <ShareIcon/></div>
        <div>Collaborate with Notes → <NotesIcon/></div>
        <div>View element properties → <ListIcon/></div>
        <div>View building plans → <CutPlaneIcon/></div>
      </Box>
      <img
        src='/logo-buildings.png'
        alt='logo'
        width='100'
        style={{margin: '0 auto'}}
      />
    </Box>
  )
}
