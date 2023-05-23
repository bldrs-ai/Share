/* eslint-disable max-len */
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
        width: '268px',
        height: '160px',
        fontSize: '.9em',
        fontWeight: 'bold',
        borderRadius: '10px',
        margin: '2em 0',
        padding: '.5em 1em .7em .5em',
        color: theme.palette.primary.contrastText,
        backgroundColor: theme.palette.background.button,
        // border: `1px solid ${theme.palette.primary.main}`,
        textAlign: 'left',
      }}
    >
      <Box
        sx={{
          padding: '4px 4px 4px 8px',
        }}
      >
        <Typography variant={'h2'}>
            Open workspaces, open standards and open source code is the most powerful way to work.
            Cooperation is the unfair advantage.
        </Typography>
        <Box
          sx={{
            // marginRight: 'px',
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'flex-end',
            position: 'relative',
            top: '1.0em',
          }}
        >
          <a
            href='https://bldrs.ai/share/v/p/index.ifc#c:-93.79,4.24,100.38,-43.48,15.73,-4.34::i:1148362525'
            onClick={onClickLink}
          >
            <Typography variant={'h2'} sx={{textDecoration: 'underline', marginLeft: '10px'}}>Guide</Typography>
          </a>
          {/* <a
            // eslint-disable-next-line max-len
            href='https://bldrs.ai/share/v/gh/OlegMoshkovich/Logo/main/IFC_STUDY.ifc#c:40.821,-10.247,39.647,5.918,-13.326,-13.866::i:1605443723'
            onClick={onClickLink}
          >
            <Typography variant={'h2'} sx={{textDecoration: 'underline', marginLeft: '10px'}}>Team</Typography>
          </a> */}
        </Box>
      </Box>
    </Box>
  )
}

