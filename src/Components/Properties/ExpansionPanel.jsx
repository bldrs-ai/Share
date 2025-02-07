import React, {ReactElement, useEffect, useState} from 'react'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Typography from '@mui/material/Typography'
import PsetOpenIcon from '@mui/icons-material/KeyboardArrowDown'


/**
 * Expansion panels are used to package property sets
 *
 * @property {string} summary Title of the panel
 * @property {string} detail Content of the panel
 * @property {boolean} expandState global control of the panel
 * @return {ReactElement}
 */
export default function ExpansionPanel({summary, detail, expandState}) {
  const [expanded, setExpanded] = useState(expandState)

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
        expandIcon={<PsetOpenIcon className='icon-share'/>}
        aria-controls='panel1a-content'
        id='panel1a-header'
      >
        <Typography sx={{
          'maxWidth': '260px',
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
