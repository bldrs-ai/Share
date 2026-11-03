import React, {ReactElement} from 'react'
import {Box, Link, Slider, Stack, Typography} from '@mui/material'
import {CONSENT_LEVEL_ORDER, CONSENT_LEVELS} from '../../privacy/consent'


/*
 * What each level says to the visitor. This is the "informed" part of the
 * consent, so it has to stay true to what the code does at that level
 * (privacy/consent.js, index/ga.js), and to the privacy policy's
 * "Analytics (optional)" section (src/pages/Privacy.jsx and its marketing
 * copy). Change all three together.
 */
export const CONSENT_COPY = Object.freeze({
  [CONSENT_LEVELS.RESTRICTED]: {
    label: 'Browse only',
    summary: 'No Google Analytics and no analytics cookies. Error reports still go to our error monitoring.',
  },
  [CONSENT_LEVELS.FUNCTIONAL]: {
    label: 'Functional',
    summary:
      'Google Analytics with a pseudonymous ID: visits, and which kinds of models are opened ' +
      '(format, size, source). Also measures our Google Ads.',
  },
  [CONSENT_LEVELS.PUBLIC]: {
    label: 'Public sharing',
    summary: 'Functional, plus we may analyze the content of public models you open.',
  },
})


/**
 * The privacy-level slider in the About (welcome) dialog. Controlled: it
 * only reports the position. Nothing is stored or collected until the
 * dialog's OK (AboutDialog), so moving it is free.
 *
 * @property {string} level one of CONSENT_LEVELS
 * @property {Function} setLevel called with the new level
 * @return {ReactElement}
 */
export default function ConsentControl({level, setLevel}) {
  const marks = CONSENT_LEVEL_ORDER.map((l, i) => ({value: i, label: CONSENT_COPY[l].label}))
  const index = CONSENT_LEVEL_ORDER.indexOf(level)
  return (
    <Stack spacing={1} sx={{width: '100%', textAlign: 'left'}} data-testid='consent-control'>
      <Stack direction='row' justifyContent='space-between' alignItems='baseline'>
        <Typography variant='overline'>Privacy</Typography>
        <Link href='/share/privacy' variant='caption' color='inherit'>Privacy policy</Link>
      </Stack>
      {/* Side padding so the end marks' labels, centered on their marks,
          stay inside the dialog at phone width. */}
      <Box sx={{px: 4}}>
        <Slider
          value={index}
          min={0}
          max={CONSENT_LEVEL_ORDER.length - 1}
          step={null}
          marks={marks}
          onChange={(event, value) => setLevel(CONSENT_LEVEL_ORDER[value])}
          aria-label='Privacy level'
          getAriaValueText={(value) => CONSENT_COPY[CONSENT_LEVEL_ORDER[value]].label}
          valueLabelDisplay='off'
          data-testid='consent-slider'
        />
      </Box>
      <Typography variant='body2' color='text.secondary' data-testid='consent-summary'>
        {CONSENT_COPY[level].summary}
      </Typography>
    </Stack>
  )
}
