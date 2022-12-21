import React, {useState, useEffect} from 'react'
import {Box, Accordion, AccordionSummary, AccordionDetails, Typography} from '@mui/material'
import {useTheme} from '@mui/styles'
import CaretIcon from '../assets/2D_Icons/Caret.svg'


/**
 * Expansion panels are used to package property sets
 *
 * @param {string} detail title of the panel
 * @param {string} summary content of the panel
 * @param {boolean} expandState global control of the panel
 * @param {object} classes styles for the panel
 * @return {object}
 */
export default function Property({detail, summary, expandState}) {
  useEffect(() => setExpand(expandState), [expandState])
  const theme = useTheme()
  const [expand, setExpand] = useState()


  return (
    <Accordion
      elevation={0}
      sx={{
        '& .MuiAccordionSummary-root': {
          width: '100%',
          padding: 0,
          borderBottom: `.5px solid ${theme.palette.highlight.heavier}`,
        },
        '& .MuiAccordionSummary-root.Mui-expanded': {
          marginBottom: '0.5em',
        },
        '& .MuiAccordionDetails-root': {
          padding: 0,
        },
        '& svg': {
          width: '14px',
          height: '14px',
          fill: theme.palette.primary.contrastText,
          marginRight: '12px',
          marginLeft: '12px',
        },
      }}
      expanded={expand === true}
      onChange={() => setExpand(!expand)}
    >
      <AccordionSummary
        expandIcon={<CaretIcon/>}
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
        }} variant='h3'
        >
          <Box>{summary}</Box>
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        {detail}
      </AccordionDetails>
    </Accordion>
  )
}
