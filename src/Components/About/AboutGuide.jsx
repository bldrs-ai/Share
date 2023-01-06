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
        width: '260px',
        height: '180px',
        fontSize: '0.8em',
        borderRadius: '5px',
        margin: '2em 0',
        padding: '1em',
        color: theme.palette.primary.contrastText,
        // backgroundColor: colorMode.isDay() ? '#E8E8E8' : '#4C4C4C',
        border: `1px solid ${colorMode.isDay() ? 'Grey' : '#4C4C4C'}`,
      }}
    >
      <Box
        sx={{
          'float': 'right',
          'margin': '0em 0em 0em 0em',
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
        <div>Share model → <ShareIcon/></div>
        <div>Collaborate with Notes → <NotesIcon/></div>
        <div>View model item properties → <ListIcon/></div>
        <div>Section and Plan views → <CutPlaneIcon/></div>
      </Box>
      <img
        src='https://user-images.githubusercontent.com/3433606/211069358-034f639e-3cfd-4a05-803b-313b96a0c25b.png'
        alt='logo'
        width='100'
        style={{
          margin: '1.7em auto',
          width: '60%',
        }}
      />
    </Box>
  )
}
