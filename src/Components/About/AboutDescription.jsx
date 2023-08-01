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
        width: '280px',
        fontSize: '.9em',
        fontWeight: 'bold',
        borderRadius: '8px',
        margin: '1em 0',
        padding: '.3em 1em .5em .5em',
        color: theme.palette.primary.contrastText,
        textAlign: 'left',
      }}
    >
      <Box
        sx={{
          padding: '6px 6px',
        }}
      >
        <Typography variant={'h5'} sx={{fontSize: '.8em'}} >
          {/* Cross-functional online collaboration unlocks team flow,
            productivity and creativity.
            Open workspaces, open standards and open source code is the most powerful way to work.
            Cooperation is the unfair advantage. */}
          Share is a cross-functional online collaboration platform that aims
          to unlock team flow, productivity and creativity for the builders of the world.
          We believe open workspaces, open standards and open source code is the most powerful way to work since
          the foundation of these practices is cooperation, which clearly is the unfair advantage.
        </Typography>
        <Box
          sx={{
            marginRight: '-6px',
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'flex-end',
            position: 'relative',
          }}
        >
          <a
            // eslint-disable-next-line max-len
            href='https://deploy-preview-701--bldrs-share.netlify.app/share/v/p/index.ifc#c:-93.79,4.24,100.38,-43.48,15.73,-4.34::i:1148362525'
            onClick={onClickLink}
          >
            <Typography sx={{textDecoration: 'underline', marginLeft: '10px'}}>Welcome</Typography>
          </a>
        </Box>
      </Box>
    </Box>
  )
}
