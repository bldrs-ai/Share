import React, {ReactElement, useState} from 'react'
import {Box, ButtonBase, Grid, Typography} from '@mui/material'
import useQuota from '../../hooks/useQuota'
import {SAMPLE_MODELS, sampleFormat, thumbnailUrl} from './sampleModelRoster'


/**
 * @property {Function} setIsDialogDisplayed callback
 * @property {Function} navigate Callback from OpenModelDialog to change page url
 * @return {ReactElement}
 */
export default function SampleModels({navigate, setIsDialogDisplayed}) {
  // Lazy import to avoid circulars in tests
  const {navigateToModel} = require('../../utils/navigate')
  const [, setSelected] = useState('')
  const {record} = useQuota()

  const handleSelect = (model, closeDialog) => {
    setSelected(model.name)
    // Sample models are public; the server resolves them as such and the
    // call is a free no-op whose result we don't gate on — fire-and-forget
    // so the click navigates immediately instead of waiting out a token
    // fetch + record-load round-trip. record() never rejects.
    record(model.path.split('#')[0])
    navigateToModel({pathname: model.path}, navigate)
    closeDialog()
  }

  const cardSx = {
    'width': '100%',
    'flexDirection': 'column',
    'alignItems': 'stretch',
    'borderRadius': 1,
    'overflow': 'hidden',
    'backgroundColor': 'action.hover',
    '&:hover': {backgroundColor: 'action.selected'},
  }

  // Square keeps every card the same height regardless of how tall or
  // wide its model is — the thumbnails are already trimmed and padded to
  // a common fill by the generator.
  const thumbnailSx = {
    width: '100%',
    aspectRatio: '1 / 1',
    objectFit: 'contain',
    display: 'block',
  }

  const badgeSx = {
    position: 'absolute',
    top: 4,
    right: 4,
    padding: '0 4px',
    borderRadius: 0.5,
    backgroundColor: 'action.selected',
    // The roster is curated for format diversity (IFC/STEP/FBX/PDB);
    // without this the mix is invisible to the user.
    fontSize: '0.625rem',
    lineHeight: 1.6,
    letterSpacing: '0.04em',
  }

  return (
    <Grid
      container
      spacing={2}
      justifyContent='center'
      alignItems='center'
      sx={{justifyContent: 'center', alignItems: 'center'}}
      data-testid={`dialog-open-model-samples`}
    >
      {SAMPLE_MODELS.map((model, i) => (
        <Grid item xs={6} key={model.name} sx={{padding: '0.5em !important'}}>
          <ButtonBase
            sx={cardSx}
            onClick={() => handleSelect(model, () => setIsDialogDisplayed(false))}
            data-testid={`sample-model-card-${i}`}
          >
            <Box sx={{position: 'relative', width: '100%'}}>
              <Box
                component='img'
                src={thumbnailUrl(model.name)}
                alt={model.name}
                loading='lazy'
                sx={thumbnailSx}
              />
              <Typography variant='overline' sx={badgeSx}>
                {sampleFormat(model.path)}
              </Typography>
            </Box>
            <Typography variant='caption' sx={{padding: '4px 0 6px'}}>
              {model.name}
            </Typography>
          </ButtonBase>
        </Grid>
      ))}
    </Grid>
  )
}
