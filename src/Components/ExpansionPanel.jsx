import React, {useState, useEffect} from 'react'
import Accordion from '@mui/material/Accordion'
import AccordionSummary from '@mui/material/AccordionSummary'
import AccordionDetails from '@mui/material/AccordionDetails'
import Typography from '@mui/material/Typography'
import {makeStyles, useTheme} from '@mui/styles'
import CaretIcon from '../assets/2D_Icons/Caret.svg'


/**
 * Expansion panels are used to package property sets
 *
 * @param {string} detail title of the panel
 * @param {string} summary content of the panel
 * @param {boolean} expandState global control of the panel
 * @param {object} classes styles for the panel
 * @return {React.ReactElement}
 */
export default function Property({detail, summary, expandState}) {
  useEffect(() => setExpand(expandState), [expandState])
  const classes = useStyles(useTheme())
  const [expand, setExpand] = useState()
  return (
    <Accordion
      elevation={0}
      className={classes.accordian}
      expanded={expand === true}
      onChange={() => setExpand(!expand)}
    >
      <AccordionSummary
        expandIcon={<CaretIcon/>}
        aria-controls="panel1a-content"
        id="panel1a-header"
      >
        <Typography className={classes.summary} variant='h3'>
          <div >
            {summary}
          </div>
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        {detail}
      </AccordionDetails>
    </Accordion>
  )
}


const useStyles = makeStyles((theme) => ({
  accordian: {
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
  },
  summary: {
    'maxWidth': '320px',
    'whiteSpace': 'nowrap',
    'overflow': 'hidden',
    'textOverflow': 'ellipsis',
    '@media (max-width: 900px)': {
      maxWidth: '320px',
    },
  },
}))
