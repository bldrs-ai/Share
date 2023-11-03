import React, {useEffect, useState} from 'react'
import Accordion from '@mui/material/Accordion'
import AccordionSummary from '@mui/material/AccordionSummary'
import AccordionDetails from '@mui/material/AccordionDetails'
import Typography from '@mui/material/Typography'
import CaretIcon from '../assets/icons/Caret.svg'
import useTheme from '@mui/styles/useTheme'


/**
 * Expansion panels are used to package property sets
 *
 * @property {string} summary content of the panel
 * @property {string} detail title of the panel
 * @property {boolean} expandState global control of the panel
 * @return {React.ReactElement}
 */
export default function ExpansionPanel({summary, detail, expandState}) {
  const [expanded, setExpanded] = useState(expandState)
  const theme = useTheme()


  useEffect(() => {
    setExpanded(expandState)
  }, [expandState])


  return (
    <Accordion
      elevation={0}
      sx={{
        'marginBottom': '10px',
        'borderRadius': '10px',
        'border': 'none',
        'backgroundColor': theme.palette.scene.background,
        '& .MuiAccordionSummary-root': {
          width: '100%',
        },
        '& .MuiAccordionSummary-root.Mui-expanded': {
          marginBottom: '0.5em',
        },
        '&:before': {
          backgroundColor: 'transparent',
        },
      }}
      expanded={expanded}
      onChange={() => setExpanded(!expanded)}
    >
      <AccordionSummary
        expandIcon={<CaretIcon className='caretToggle'/>}
        aria-controls="panel1a-content"
        id="panel1a-header"
      >
        <Typography sx={{
          'maxWidth': '320px',
          'whiteSpace': 'nowrap',
          'overflow': 'hidden',
          'textOverflow': 'ellipsis',
          '@media (max-width: 900px)': {
            maxWidth: '320px',
          },
        }}
        >
          {summary}
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        {detail}
      </AccordionDetails>
    </Accordion>
  )
}
