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
  const fontStyle = {
    marginTop: '4px',
    // fontWeight: '400',
    // color: 'lime',
    fontSize: '18px',
    lineHeight: '24px',
    color: theme.palette.primary.contrastText,
  }

  /**
   * Close About dialog when a link is clicked
   */
  function onClickLink() {
    setIsDialogDisplayed(false)
  }
  return (
    <Box
      sx={{
        width: '320px',
        // height: '160px',
        // fontSize: '.9em',
        // fontWeight: 'bold',
        // borderRadius: '8px',
        // marginTop: '10px',
        // padding: '.3em 0em .5em 0em',
        color: theme.palette.primary.contrastText,
        // backgroundColor: theme.palette.background.button,
        // border: `1px solid ${theme.palette.primary.main}`,
        textAlign: 'left',
      }}
    >
      <Box
        sx={{
          marginTop: '20px',
        }}
      >
        <Typography variant={'h5'} >

          <Box sx={fontStyle}>
          1. Cooperation is the unfair advantage.
          </Box>
          <Box sx={fontStyle}>
          2. Open standards and open source code is the most powerful way to work.
          </Box>

          <br/>
          {/* Cross-functional online collaboration unlocks team flow,
          productivity and creativity.
          <br/> */}

        </Typography>

        <Box
          sx={{
            marginRight: '-6px',
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'flex-end',
            position: 'relative',
            top: '3.4em',
          }}
        >
          {/* <a
            href='https://bldrs.ai/share/v/p/index.ifc#c:-113.444,0.464,81.43,-23.595,24.522,10.88::i:1493510953'
            onClick={onClickLink}
          >
            <Typography sx={{textDecoration: 'underline', marginLeft: '10px'}}>Guide</Typography>
          </a> */}
          <a
            // eslint-disable-next-line max-len
            href='https://bldrs.ai/share/v/gh/OlegMoshkovich/Logo/main/IFC_STUDY.ifc#c:40.821,-10.247,39.647,5.918,-13.326,-13.866::i:1605443723'
            onClick={onClickLink}
          >
            {/* <Typography sx={{textDecoration: 'underline', marginLeft: '10px'}}>Team</Typography> */}
          </a>
        </Box>
      </Box>
    </Box>
  )
}
