import React, {ReactElement} from 'react'
import {Box, Button, LinearProgress, Typography, useTheme} from '@mui/material'
import {aiCreditsCopy} from '../../quota/aiCreditsCopy'
import {meterView} from './meterView'


/**
 * How much of the hosted assistant's credits the caller has used, from the
 * relay's own figures (assistState.js `assistCredits`): a share, never a
 * dollar amount. Normal, then a warning once it's low, then error when the
 * relay has refused for want of credits, where it offers the tier's next
 * step again (the dialog that opened with the refusal may have been dismissed).
 *
 * The bar and its label are one `progressbar`, so a screen reader hears the
 * same sentence a sighted user reads.
 *
 * @property {object} credits `{tier, used, limit, exhausted}`
 * @property {Function} onMore Opens the out-of-credits dialog; offered only when exhausted
 * @return {ReactElement}
 */
export default function CreditsMeter({credits, onMore}) {
  const theme = useTheme()
  const {percent, state, label} = meterView(credits)
  const color = {normal: 'primary', low: 'warning', exhausted: 'error'}[state]
  const {cta, ctaLabel} = aiCreditsCopy(credits.tier)
  return (
    <Box data-testid='BotChat-CreditsMeter' data-state={state} sx={{px: 0.5}}>
      <Box sx={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1}}>
        <Typography
          variant='caption'
          sx={{color: state === 'normal' ? theme.palette.text.secondary : theme.palette[color].main}}
          data-testid='BotChat-CreditsMeterLabel'
        >
          {label}
        </Typography>
        {state === 'exhausted' && cta !== null && (
          <Button
            size='small'
            variant='text'
            onClick={onMore}
            data-testid='BotChat-CreditsMeterMore'
            sx={{minWidth: 0, py: 0, textTransform: 'none', whiteSpace: 'nowrap'}}
          >
            {ctaLabel}
          </Button>
        )}
      </Box>
      <LinearProgress
        variant='determinate'
        value={percent}
        color={color}
        aria-label={label}
        sx={{height: 4, borderRadius: 2, mt: 0.5}}
      />
    </Box>
  )
}
