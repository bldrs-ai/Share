import React from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import useTheme from '@mui/styles/useTheme'


/**
 * A miniature view of the App to show as a guide in the About dialog.
 *
 * @return {React.ReactComponent}
 */
export default function AboutDescription({setIsDialogDisplayed}) {
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
        fontSize: '.9em',
        fontWeight: 'bold',
        borderRadius: '10px',
        margin: '2em 0',
        padding: '.3em 1em .5em .5em',
        color: theme.palette.primary.contrastText,
        backgroundColor: theme.palette.scene.background,
        textAlign: 'left',
      }}
    >
      <Box
        sx={{
          padding: '5px 10px',
        }}
      >
        <Typography varinnt>
          Bldrs.ai is an environment to access and opearate 3D information models which contain
          semantic information about the world.
        </Typography>
        <Box
          sx={{
            marginRight: '-6px',
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'flex-end',
          }}
        >
          <a
            // eslint-disable-next-line max-len
            href='https://deploy-preview-638--bldrs-share.netlify.app/share/v/gh/OlegMoshkovich/Logo/main/IFC_STUDY.ifc#c:40.821,-10.247,39.647,5.918,-13.326,-13.866::i:1605443723'
            onClick={onClickLink}
          >
            <div style={{textDecoration: 'underline', marginLeft: '10px'}}>Guide</div>
          </a>
          <a
            // eslint-disable-next-line max-len
            href='https://deploy-preview-638--bldrs-share.netlify.app/share/v/gh/OlegMoshkovich/Logo/main/IFC_STUDY.ifc#c:40.821,-10.247,39.647,5.918,-13.326,-13.866::i:1605443723'
            onClick={onClickLink}
          >
            <div style={{textDecoration: 'underline', marginLeft: '10px'}}>Team</div>
          </a>
        </Box>
      </Box>
    </Box>
  )
}
