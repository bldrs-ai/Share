import React, {ReactElement, useState} from 'react'
import {Grid, Chip, Typography} from '@mui/material'
import AccessibilityIcon from '@mui/icons-material/AccessibilityOutlined'
import Bplaza from '../../assets/icons/Bplaza.svg'
import Gear from '../../assets/icons/Gear.svg'
import Momentum from '../../assets/icons/Momentum.svg'
import Placeholder from '../../assets/icons/Placeholder.svg'
import Schependomlaan from '../../assets/icons/Schependomlaan.svg'
import Seestrasse from '../../assets/icons/Seestrasse.svg'
import Sheenstock from '../../assets/icons/Sheenstock.svg'


/**
 * @property {Function} setIsDialogDisplayed callback
 * @property {Function} navigate Callback from OpenModelDialog to change page url
 * @return {ReactElement}
 */
export default function SampleModels({navigate, setIsDialogDisplayed}) {
  const [, setSelected] = useState('')
  const iconsStyle = {height: '1.6em'}
  const modelPath = {
    Momentum: '/share/v/gh/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc#c:-38.64,12.52,35.4,-5.29,0.94,0.86',
    Schneestock: '/share/v/gh/Swiss-Property-AG/Schneestock-Public/main/ZGRAGGEN.ifc#c:80.66,11.66,-94.06,6.32,2.93,-8.72',
    Seestrasse: '/share/v/gh/Swiss-Property-AG/Seestrasse-Public/main/SEESTRASSE.ifc#c:119.61,50.37,73.68,16.18,11.25,5.74',
    Schependomlaan: '/share/v/gh/bldrs-ai/test-models/main/ifc/Schependomlaan.ifc#c:60.45,-4.32,60.59,1.17,5.93,-3.77',
    Structural_detail: '/share/v/gh/bldrs-ai/test-models/main/ifc/openifcmodels/171210AISC_Sculpture_param.ifc',
    Bldrs_plaza: '/share/v/gh/OlegMoshkovich/Bldrs_Plaza/main/IFC_STUDY.ifc#c:220.607,-9.595,191.198,12.582,27.007,-21.842',
    Vitruvius: '/share/v/gh/bldrs-ai/test-models/main/fbx/samba-dancing.fbx#c:-1.016,129.356,253.729,0,90.107,2.409',
    Gear: '/share/v/gh/bldrs-ai/test-models/main/step/zoo.dev/a-gear.step',
  }

  const modelIcon = {
    Momentum: <Momentum style={iconsStyle}/>,
    Schneestock: <Sheenstock style={iconsStyle}/>,
    Seestrasse: <Seestrasse style={iconsStyle}/>,
    Schependomlaan: <Schependomlaan style={iconsStyle}/>,
    Structural_detail: <Placeholder style={iconsStyle}/>,
    Bldrs_plaza: <Bplaza style={iconsStyle}/>,
    Vitruvius: <AccessibilityIcon style={iconsStyle}/>,
    Gear: <Gear style={iconsStyle}/>,
  }

  const handleSelect = (modelName, closeDialog) => {
    setSelected(modelName)
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
            label={
              <>
                {modelIcon[model]}
                <Typography variant="caption" sx={{marginTop: '.5em'}}>{model}</Typography>
              </>
            }
            variant="sampleModel"
            data-testid='sample-model-chip'
            onClick={() => handleSelect(model, () => setIsDialogDisplayed(false))}
            color="primary"
          />
        </Grid>
      ))}
    </Grid>
  )
}

