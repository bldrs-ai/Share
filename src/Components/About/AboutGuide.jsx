import React, {useContext} from 'react'
import Box from '@mui/material/Box'
import {useTheme} from '@mui/styles'
import {ColorModeContext} from '../../Context/ColorMode'
import CutPlaneIcon from '../../assets/icons/CutPlane.svg'
import ListIcon from '../../assets/icons/List.svg'
import NotesIcon from '../../assets/icons/Notes.svg'
import ShareIcon from '../../assets/icons/Share.svg'
import LogoBuildings from '../../assets/Logo_Buildings.svg'


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
        height: '160px',
        fontSize: '0.8em',
        borderRadius: '10px',
        margin: '2em 0',
        padding: '.5em 1em .5em .5em',
        color: theme.palette.primary.contrastText,
        backgroundColor: colorMode.isDay() ? '#E8E8E8' : '#353535',
        // border: `1px solid ${colorMode.isDay() ? 'Grey' : '#4C4C4C'}`,
      }}
    >
      <Box
        sx={{
          'float': 'right',
          'margin': '.4em 0em 0em 0em',
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
          '& a': {
            textAlign: 'right',
            verticalAlign: 'middle',
            whiteSpace: 'nowrap',
            lineHeight: '15px',
          },
        }}
      >
        <div>
          <a
            href='https://bldrs.ai/share/v/p/index.ifc#c:-111.37,14.94,90.63,-43.48,15.73,-4.34::i:1493510953'
            target='_new'
          >
              Share model → <ShareIcon/>
          </a>
        </div>
        <div>Collaborate with Notes → <NotesIcon/></div>
        <div>
          <a
            href='http://bldrs.ai/share/v/p/index.ifc#c:-111.37,14.94,90.63,-43.48,15.73,-4.34::i:1527240734'
            target='_new'
          >
              View model item properties → <ListIcon/>
          </a>
        </div>
        <div>Section and Plan views → <CutPlaneIcon/></div>
      </Box>
      <Box
        sx={{
          'float': 'right',
          'margin': '1.4em 4em 0em 0em',
          '& svg': {
            width: '120px',
            height: '50px',
            opacity: .9,
          },
        }}
      >
        <LogoBuildings/>
      </Box>
    </Box>
  )
}
