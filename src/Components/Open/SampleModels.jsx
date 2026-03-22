import React, {ReactElement} from 'react'
import {Box, ButtonBase, Typography} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import {FileText} from 'lucide-react'


/**
 * @property {Function} setIsDialogDisplayed callback
 * @property {Function} navigate Callback from OpenModelDialog to change page url
 * @return {ReactElement}
 */
export default function SampleModels({navigate, setIsDialogDisplayed}) {
  const {navigateToModel} = require('../../utils/navigate')
  const theme = useTheme()

  const models = [
    {name: 'Momentum', path: '/share/v/gh/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc#c:-38.64,12.52,35.4,-5.29,0.94,0.86'},
    {name: 'Schneestock', path: '/share/v/gh/Swiss-Property-AG/Schneestock-Public/main/ZGRAGGEN.ifc#c:80.66,11.66,-94.06,6.32,2.93,-8.72'},
    {name: 'Seestrasse', path: '/share/v/gh/Swiss-Property-AG/Seestrasse-Public/main/SEESTRASSE.ifc#c:119.61,50.37,73.68,16.18,11.25,5.74'},
    {name: 'Schependomlaan', path: '/share/v/gh/bldrs-ai/test-models/main/ifc/Schependomlaan.ifc#c:60.45,-4.32,60.59,1.17,5.93,-3.77'},
    {name: 'Structural Detail', path: '/share/v/gh/bldrs-ai/test-models/main/ifc/openifcmodels/171210AISC_Sculpture_param.ifc'},
    {name: 'Bldrs Plaza', path: '/share/v/gh/OlegMoshkovich/Bldrs_Plaza/main/IFC_STUDY.ifc#c:220.607,-9.595,191.198,12.582,27.007,-21.842'},
    {name: 'Vitruvius (FBX)', path: '/share/v/gh/bldrs-ai/test-models/main/fbx/samba-dancing.fbx#c:-1.016,129.356,253.729,0,90.107,2.409'},
    {name: 'Gear (STEP)', path: '/share/v/gh/bldrs-ai/test-models/main/step/zoo.dev/a-gear.step'},
  ]

  const handleSelect = (model) => {
    navigateToModel({pathname: model.path}, navigate)
    setIsDialogDisplayed(false)
  }

  return (
    <Box sx={{display: 'flex', flexDirection: 'column', gap: '2px', width: '100%'}}>
      {models.map((model, i) => (
        <ButtonBase
          key={i}
          onClick={() => handleSelect(model)}
          sx={{
            'display': 'flex',
            'alignItems': 'center',
            'gap': '0.6rem',
            'width': '100%',
            'padding': '6px 10px',
            'borderRadius': '4px',
            'textAlign': 'left',
            'justifyContent': 'flex-start',
            '&:hover': {background: theme.palette.action.hover},
          }}
          data-testid={`sample-model-chip-${i}`}
        >
          <FileText size={14} strokeWidth={1.5} style={{opacity: 0.5, flexShrink: 0}}/>
          <Typography variant='body2' sx={{fontSize: '13px'}}>{model.name}</Typography>
        </ButtonBase>
      ))}
    </Box>
  )
}
