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
          padding: '10px 10px',
        }}
      >
        <Typography variant={'h3'}>
          Bldrs.ai is an open workspace to access and opearate 3D information models.
        </Typography>
        <Box
          sx={{
            marginRight: '-6px',
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'flex-end',
            position: 'relative',
            top: '4em',
          }}
        >
          <a
            // eslint-disable-next-line max-len
            href='https://bldrs.ai/share/v/p/index.ifc#c:-119.076,0.202,83.165,-44.967,19.4,-4.972::i:1506392033'
            onClick={onClickLink}
          >
            <div style={{textDecoration: 'underline', marginLeft: '10px'}}>Guide</div>
          </a>
          <a
            // eslint-disable-next-line max-len
            href='https://bldrs.ai/share/v/gh/OlegMoshkovich/Logo/main/IFC_STUDY.ifc#c:40.821,-10.247,39.647,5.918,-13.326,-13.866::i:1605443723'
            onClick={onClickLink}
          >
            <div style={{textDecoration: 'underline', marginLeft: '10px'}}>Team</div>
          </a>
        </Box>
      </Box>
    </Box>
  )
}
