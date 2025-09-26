import React, {ReactElement, useState} from 'react'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import {disablePageReloadApprovalCheck} from '../../utils/event'
import {navigateToModel} from '../../utils/navigate'


/**
 * @property {Function} setIsDialogDisplayed callback
 * @return {ReactElement}
 */
export default function SampleModelFileSelector({navigate, setIsDialogDisplayed}) {
  const [selected, setSelected] = useState('')

  const handleSelect = (e, closeDialog) => {
    setSelected(e.target.value)
    const modelPath = {
      0: '/share/v/gh/bldrs-ai/test-models/main/ifc/Schependomlaan.ifc#c:60.45,-4.32,60.59,1.17,5.93,-3.77',
      1: '/share/v/gh/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc#c:-38.64,12.52,35.4,-5.29,0.94,0.86',
      2: '/share/v/gh/Swiss-Property-AG/Schneestock-Public/main/ZGRAGGEN.ifc#c:80.66,11.66,-94.06,6.32,2.93,-8.72',
      3: '/share/v/gh/Swiss-Property-AG/Seestrasse-Public/main/SEESTRASSE.ifc#c:119.61,50.37,73.68,16.18,11.25,5.74',
      4: '/share/v/gh/bldrs-ai/test-models/main/ifc/openifcmodels/171210AISC_Sculpture_param.ifc',
      5: '/share/v/gh/OlegMoshkovich/Bldrs_Plaza/main/IFC_STUDY.ifc#c:220.607,-9.595,191.198,12.582,27.007,-21.842',
      6: '/share/v/gh/bldrs-ai/test-models/main/fbx/samba-dancing.fbx#c:-1.016,129.356,253.729,0,90.107,2.409',
    }
    disablePageReloadApprovalCheck()
    // navigate({pathname: modelPath[e.target.value]})
    navigateToModel({pathname: modelPath[e.target.value]}, navigate)
    closeDialog()
  }

  return (
    <TextField
      sx={{width: '260px'}}
      value={selected}
      onChange={(e) => handleSelect(e, () => setIsDialogDisplayed(false))}
      variant='outlined'
      label='Sample Projects'
      select
      size='small'
      data-testid='textfield-sample-projects'
    >
      <MenuItem value={1}>Momentum</MenuItem>
      <MenuItem value={2}>Schneestock</MenuItem>
      <MenuItem value={3}>Seestrasse</MenuItem>
      <MenuItem value={4}>Schependomlaan</MenuItem>
      <MenuItem value={5}>Structural Detail</MenuItem>
      <MenuItem value={6}>Bldrs plaza</MenuItem>
      <MenuItem value={7}>Eisvogel</MenuItem>
    </TextField>
  )
}
