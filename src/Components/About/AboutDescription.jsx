import React, {ReactElement} from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import useTheme from '@mui/material/styles/useTheme'


/**
 * A miniature view of the App to show as a guide in the About dialog.
 *
 * @return {ReactElement}
 */
export default function AboutDescription({setIsDialogDisplayed}) {
  const theme = useTheme()

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
      <Typography variant={'body2'}>
          Cross-functional online collaboration unlocks team flow,
          productivity and creativity.
          Open workspaces, open standards and open source code is the most powerful way to work.
          Cooperation is the unfair advantage.
      </Typography>
    </Box>
  )
}

