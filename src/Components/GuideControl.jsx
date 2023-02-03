import React, {useState} from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Close from '../assets/icons/Clear.svg'
import Question from '../assets/icons/Question.svg'


/**
 * A UI control to toggle Guide panel on and off
 *
 * @param {number} offsetTop position of the panel
 * @return {object} The GuidePanelControl react component.
 */
export default function GuidePanelControl({offsetTop}) {
  const [open, setOpen] = useState(false)


  return (
    <IconButton onClick={() => {
      setOpen(!open)
    }}
    >
      <Question sx={{
        width: '30px',
        height: '30px',
        cursor: 'pointer',
      }}
      />
      {open &&
        <GuidePanel
          openToggle={() => {
            setOpen(!open)
          }}
          offsetTop={offsetTop}
        />
      }
    </IconButton>)
}


/**
 * Guide Panel component
 *
 * @param {boolean} openToggle React state toggle.
 * @param {string} offset Distance from from the top of the page in css.
 * @return {object} Guide panel react component.
 */
function GuidePanel({openToggle, offsetTop}) {
  return (
    <Box sx={{
      position: 'fixed',
      top: '0px',
      left: '0px',
      width: '100%',
      height: '100vh',
      display: 'flex',
      justifyContent: 'center',
    }}
    >
      <Paper sx={{
        'position': 'relative',
        'top': '82px',
        'width': '460px',
        'height': '320px',
        'fontFamily': 'Helvetica',
        'padding': '1em 1em',
        '@media (max-width: 900px)': {
          width: '86%',
          height: '310px',
        },
        '& h1': {
          marginTop: 0,
          fontWeight: 200,
        },
        '& p, & li': {
          fontWeight: 200,
          textAlign: 'left',
        },
      }} elevation={3}
      >
        <Box sx={{
          'float': 'right',
          'cursor': 'pointer',
          'marginTop': '8px',
          '& svg': {
            width: '24px',
            height: '20px',
          },
        }}
        ><Close onClick={openToggle}/>
        </Box>
        <Typography variant='h1'>Guide</Typography>
        <p>To select an element:</p>
        <ul>
          <li>Double tap an element</li>
          <li>X is used to clear the selection</li>
        </ul>
        <p>To attach a cut plane:</p>
        <ul>
          <li>Tap a model element</li>
          <li>Tap a section plane button</li>
          <li>Attach multiple planes</li>
          <li>X is used to clear the planes</li>
        </ul>
      </Paper>
    </Box>
  )
}
