import React, {ReactElement, useState} from 'react'
import {Grid, Chip, Typography} from '@mui/material'
import {handleBeforeUnload} from '../../utils/event'
import Momentum from '../../assets/icons/Momentum.svg'
import Eisvogel from '../../assets/icons/Eisvogel.svg'
import Seestrasse from '../../assets/icons/Seestrasse.svg'
import Sheenstock from '../../assets/icons/Sheenstock.svg'
import Placeholder from '../../assets/icons/Placeholder.svg'


/**
 * @property {Function} setIsDialogDisplayed callback
 * @property {Function} navigate Callback from OpenModelDialog to change page url
 * @return {ReactElement}
 */
function SampleModelFileSelector({navigate, setIsDialogDisplayed}) {
  const [, setSelected] = useState('')
  const modelPath = {
    Momentum: '/share/v/gh/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc#c:-38.64,12.52,35.4,-5.29,0.94,0.86',
    Schneestock: '/share/v/gh/Swiss-Property-AG/Schneestock-Public/main/ZGRAGGEN.ifc#c:80.66,11.66,-94.06,6.32,2.93,-8.72',
    Eisvogel: '/share/v/gh/Swiss-Property-AG/Eisvogel-Public/main/EISVOGEL.ifc#c:107.36,8.46,156.67,3.52,2.03,16.71',
    Seestrasse: '/share/v/gh/Swiss-Property-AG/Seestrasse-Public/main/SEESTRASSE.ifc#c:119.61,50.37,73.68,16.18,11.25,5.74',
    Schependomlaan: '/share/v/gh/bldrs-ai/test-models/main/ifc/Schependomlaan.ifc#c:60.45,-4.32,60.59,1.17,5.93,-3.77',
    Structural_detail: '/share/v/gh/bldrs-ai/test-models/main/ifc/openifcmodels/171210AISC_Sculpture_param.ifc',
    Bldrs_plaza: '/share/v/gh/OlegMoshkovich/Bldrs_Plaza/main/IFC_STUDY.ifc#c:220.607,-9.595,191.198,12.582,27.007,-21.842',
    Bldrs: '/share/v/gh/OlegMoshkovich/Bldrs_Plaza/main/IFC_STUDY.ifc#c:220.607,-9.595,191.198,12.582,27.007,-21.842',
  }

  const modelIcon = {
    Momentum: <Momentum style={{height: '1.5em'}}/>,
    Schneestock: <Sheenstock style={{height: '1.5em'}}/>,
    Eisvogel: <Eisvogel style={{height: '1.5em'}}/>,
    Seestrasse: <Seestrasse style={{height: '1.5em'}}/>,
    Schependomlaan: <Placeholder style={{height: '1.5em'}}/>,
    Structural_detail: <Placeholder style={{height: '1.5em'}}/>,
    Bldrs_plaza: <Placeholder style={{height: '1.5em'}}/>,
    Bldrs: <Placeholder style={{height: '1.5em'}}/>,
  }

  const handleSelect = (modelName, closeDialog) => {
    setSelected(modelName)
    window.removeEventListener('beforeunload', handleBeforeUnload)
    navigate({pathname: modelPath[modelName]})
    closeDialog()
  }

  return (
    <Grid
      container
      spacing={2}
      justifyContent="center"
      alignItems="center"
    >
      {Object.keys(modelPath).map((model, i) => (
        <Grid item xs={6} key={i}>
          <Chip
            sx={{
              'width': '10em',
              'height': '6em',
              'display': 'flex',
              'justifyContent': 'center',
              '& .MuiChip-label': {
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              },
            }}
            label={
              <>
                {modelIcon[model]}
                <Typography variant="caption" sx={{marginTop: '.5em'}}>{model}</Typography>
              </>
            }
            variant="outlined"
            data-testid='sample-model-chip'
            onClick={() => handleSelect(model, () => setIsDialogDisplayed(false))}
            color="primary"
          />
        </Grid>
      ))}
    </Grid>
  )
}


export default SampleModelFileSelector
