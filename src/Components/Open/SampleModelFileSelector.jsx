import React, {ReactElement, useState} from 'react'
import {MenuItem, TextField} from '@mui/material'
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
      0: '/share/v/gh/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc#c:-38.64,12.52,35.4,-5.29,0.94,0.86',
      1: '/share/v/gh/Swiss-Property-AG/Seestrasse-Public/main/SEESTRASSE.ifc#c:119.61,50.37,73.68,16.18,11.25,5.74',
      2: '/share/v/gh/OlegMoshkovich/Bldrs_Plaza/main/IFC_STUDY.ifc#c:220.607,-9.595,191.198,12.582,27.007,-21.842',
      3: '/share/v/gh/bldrs-ai/test-models/main/step/zoo.dev/a-gear.step',
      4: '/share/v/gh/bldrs-ai/test-models/main/step/grabcad/digilent-arty-z7-xilinx-artix-7-soc-fpga-board-1.snapshot.1/Arty_Z7.stp',
      5: '/share/v/gh/bldrs-ai/test-models/main/step/grabcad/jet-engine-220.snapshot.1/Jetenginestep.stp',
      6: '/share/v/gh/bldrs-ai/test-models/main/step/pollen-robotics/AmazingHand/Right_Hand.step',
      7: '/share/v/gh/webaverse/assets/master/animations/ybot.fbx',
      8: '/share/v/gh/bldrs-ai/test-models/main/pdb/caffeine.pdb',
    }
    disablePageReloadApprovalCheck()
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
      <MenuItem value={0}>Momentum</MenuItem>
      <MenuItem value={1}>Seestrasse</MenuItem>
      <MenuItem value={2}>Bldrs plaza</MenuItem>
      <MenuItem value={3}>Gear</MenuItem>
      <MenuItem value={4}>Arty</MenuItem>
      <MenuItem value={5}>Jetengine</MenuItem>
      <MenuItem value={6}>Robot hand</MenuItem>
      <MenuItem value={7}>Robot</MenuItem>
      <MenuItem value={8}>Caffeine</MenuItem>
    </TextField>
  )
}
