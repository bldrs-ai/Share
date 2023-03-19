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
        borderRadius: '3px',
        margin: '2em 0',
        padding: '.3em 1em .5em .5em',
        color: theme.palette.primary.contrastText,
        backgroundColor: theme.palette.primary.secondary,
        border: `1px solid ${theme.palette.primary.main}`,
        textAlign: 'left',
      }}
    >
      <Box
        sx={{
          padding: '10px 10px',
        }}
      >
        <Typography variant={'h5'}>
            Cross-functional online collaboration unlocks team flow,
            productivity and creativity.
            Open workspaces, open standards and open source code is the most powerful way to work.
            Cooperation is the unfair advantage.
        </Typography>
        <Box
          sx={{
            marginRight: '-6px',
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'flex-end',
            position: 'relative',
            top: '1.4em',
          }}
        >
          <a
            href='https://bldrs.ai/share/v/p/index.ifc#c:-113.444,0.464,81.43,-23.595,24.522,10.88::i:1493510953'
            onClick={onClickLink}
          >
            <Typography sx={{textDecoration: 'underline', marginLeft: '10px'}}>Guide</Typography>
          </a>
          <a
            // eslint-disable-next-line max-len
            href='https://bldrs.ai/share/v/gh/OlegMoshkovich/Logo/main/IFC_STUDY.ifc#c:40.821,-10.247,39.647,5.918,-13.326,-13.866::i:1605443723'
            onClick={onClickLink}
          >
            <Typography sx={{textDecoration: 'underline', marginLeft: '10px'}}>Team</Typography>
          </a>
        </Box>
      </Box>
    </Box>
  )
}

