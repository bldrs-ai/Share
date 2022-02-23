import React, {useState, useEffect} from 'react'
import Accordion from '@mui/material/Accordion'
import AccordionSummary from '@mui/material/AccordionSummary'
import AccordionDetails from '@mui/material/AccordionDetails'
import Typography from '@mui/material/Typography'
import ExpandIcon from '../assets/3D/ExpandIcon.svg'


/**
 * Expansion panels are used to package property sets
 * @param {string} detail title of the panel
 * @param {string} summary content of the panel
 * @param {boolean} expandState global control of the panel
 * @param {Object} classes styles for the panel
 * @return {Object}
 */
export default function Property({detail, summary, expandState, classes}) {
  useEffect(() => setExpand(expandState), [expandState])
  const [expand, setExpand] = useState()
  return (
    <Accordion
      className={classes.accordian}
      expanded={expand === true}
      onChange={() => setExpand(!expand)}>
      <AccordionSummary
        expandIcon={<ExpandIcon className={classes.icons} />}
        aria-controls="panel1a-content"
        id="panel1a-header"
      >
        <Typography className={classes.accordionTitle}>
          {summary}
        </Typography>
      </AccordionSummary>
      <AccordionDetails className={classes.accordianDetails}>
        {detail}
      </AccordionDetails>
    </Accordion>
  )
}
