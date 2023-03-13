import React from 'react'
import Box from '@mui/material/Box'
import useTheme from '@mui/styles/useTheme'
import LogoBuildings from '../../assets/Logo_Buildings.svg'
import NotesIcon from '../../assets/icons/Notes.svg'
import OpenIcon from '../../assets/icons/Open.svg'
import ShareIcon from '../../assets/icons/Share.svg'


/**
 * A miniature view of the App to show as a guide in the About dialog.
 *
 * @return {React.ReactComponent}
 */
export default function AboutGuide({setIsDialogDisplayed}) {
  const theme = useTheme()

  /**
   * Close About dialog when a link is clicked
   */
  function onClickLink() {
    setIsDialogDisplayed(false)
  }
  return (
    <Box
      sx={{
        width: '260px',
        height: '160px',
        fontSize: '0.8em',
        borderRadius: '10px',
        margin: '2em 0',
        padding: '.3em 1em .5em .5em',
        color: theme.palette.primary.contrastText,
        backgroundColor: theme.palette.scene.background,
      }}
    >
      <Box
        sx={{
          'float': 'right',
          'margin': '.4em 0em 0em 0em',
          '& svg': {
            width: '18px',
            height: '18px',
            verticalAlign: 'middle',
            lineHeight: '15px',
            fill: theme.palette.primary.contrastText,
          },
          '& div': {
            textAlign: 'right',
            verticalAlign: 'middle',
            whiteSpace: 'nowrap',
            lineHeight: '24px',
            fontSize: '18px',
          },
          '& a': {
            textAlign: 'right',
            verticalAlign: 'middle',
            whiteSpace: 'nowrap',
            lineHeight: '20px',
          },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
            width: '234px',
          }}
        >
          <a
            href='https://bldrs.ai/share/v/p/index.ifc#c:-111.37,14.94,90.63,-43.48,15.73,-4.34::i:1506392033'
            onClick={onClickLink}
          >
            <OpenIcon/> ← <span>Open</span>
          </a>
          <a
            href='https://bldrs.ai/share/v/p/index.ifc#c:-111.37,14.94,90.63,-43.48,15.73,-4.34::i:1493510953'
            onClick={onClickLink}
          >
            <span>Share</span> → <ShareIcon/>
          </a>
        </Box>
        <div>
          <a
            href='https://bldrs.ai/share/v/p/index.ifc#c:-111.37,14.94,90.63,-43.48,15.73,-4.34::i:1493510953'
            onClick={onClickLink}
          >
            <span>Notes</span>  → <NotesIcon/>
          </a>
        </div>
        <Box
          sx={{
            position: 'relative',
            bottom: '-3.9em',
            right: '0em',
          }}
        >
          <a
            // eslint-disable-next-line max-len
            href='https://deploy-preview-638--bldrs-share.netlify.app/share/v/gh/OlegMoshkovich/Logo/main/IFC_STUDY.ifc#c:40.821,-10.247,39.647,5.918,-13.326,-13.866::i:1605443723'
            onClick={onClickLink}
          >
            <div style={{textDecoration: 'underline'}}>Team</div>
          </a>
        </Box>
      </Box>
      <Box
        sx={{
          'float': 'right',
          'margin': '-1.8em 6.5em 0em 0em',
          '& svg': {
            width: '140px',
            height: '110px',
          },
        }}
      >
        <LogoBuildings/>
      </Box>
    </Box>
  )
}
