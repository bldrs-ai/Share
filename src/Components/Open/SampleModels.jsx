import React, {ReactElement, useState} from 'react'
import {Grid, Chip, Typography} from '@mui/material'
import {
  CoffeeOutlined as CoffeeIcon,
  FlightOutlined as FlightIcon,
  MemoryOutlined as MemoryIcon,
  PrecisionManufacturingOutlined as PrecisionManufacturingIcon,
  SmartToyOutlined as SmartToyIcon,
} from '@mui/icons-material'
import Bplaza from '../../assets/icons/Bplaza.svg'
import Gear from '../../assets/icons/Gear.svg'
import Momentum from '../../assets/icons/Momentum.svg'
import Seestrasse from '../../assets/icons/Seestrasse.svg'


/**
 * @property {Function} setIsDialogDisplayed callback
 * @property {Function} navigate Callback from OpenModelDialog to change page url
 * @return {ReactElement}
 */
export default function SampleModels({navigate, setIsDialogDisplayed}) {
  // Lazy import to avoid circulars in tests
  const {navigateToModel} = require('../../utils/navigate')
  const [, setSelected] = useState('')
  const iconsStyle = {height: '1.6em'}
  // One sample per format family: 3 IFC, 4 STEP, 1 FBX, 1 PDB. Ordering
  // is display order in the 2-col grid, and the e2e spec
  // (OpenModelDialog.spec.ts) expects Momentum at chip index 0.
  //
  // Hosting note: everything under bldrs-ai/test-models is Git-LFS-backed,
  // so those samples draw on that repo's LFS bandwidth quota. The other
  // samples (Swiss-Property-AG, OlegMoshkovich, webaverse) are plain git
  // blobs served without LFS. Robot_hand is the full right-hand assembly of
  // Pollen Robotics' AmazingHand (CC-BY-4.0), an Onshape AP242 export
  // mirrored into test-models — rendering it correctly needs conway's
  // EDGE_CURVE same_sense fix (conway fix/step-edge-same-sense). Robot is
  // the Mixamo Y Bot rig with embedded animation clips (same Mixamo
  // provenance as the previous Vitruvius samba-dancing sample).
  const modelPath = {
    Momentum: '/share/v/gh/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc#c:-38.64,12.52,35.4,-5.29,0.94,0.86',
    Seestrasse: '/share/v/gh/Swiss-Property-AG/Seestrasse-Public/main/SEESTRASSE.ifc#c:119.61,50.37,73.68,16.18,11.25,5.74',
    Bldrs_plaza: '/share/v/gh/OlegMoshkovich/Bldrs_Plaza/main/IFC_STUDY.ifc#c:220.607,-9.595,191.198,12.582,27.007,-21.842',
    Gear: '/share/v/gh/bldrs-ai/test-models/main/step/zoo.dev/a-gear.step',
    Arty: '/share/v/gh/bldrs-ai/test-models/main/step/grabcad/digilent-arty-z7-xilinx-artix-7-soc-fpga-board-1.snapshot.1/Arty_Z7.stp',
    Jetengine: '/share/v/gh/bldrs-ai/test-models/main/step/grabcad/jet-engine-220.snapshot.1/Jetenginestep.stp',
    Robot_hand: '/share/v/gh/bldrs-ai/test-models/main/step/pollen-robotics/AmazingHand/Right_Hand.step',
    Robot: '/share/v/gh/webaverse/assets/master/animations/ybot.fbx',
    Caffeine: '/share/v/gh/bldrs-ai/test-models/main/pdb/caffeine.pdb',
  }

  const modelIcon = {
    Momentum: <Momentum style={iconsStyle}/>,
    Seestrasse: <Seestrasse style={iconsStyle}/>,
    Bldrs_plaza: <Bplaza style={iconsStyle}/>,
    Gear: <Gear style={iconsStyle}/>,
    Arty: <MemoryIcon style={iconsStyle}/>,
    Jetengine: <FlightIcon style={iconsStyle}/>,
    Robot_hand: <PrecisionManufacturingIcon style={iconsStyle}/>,
    Robot: <SmartToyIcon style={iconsStyle}/>,
    Caffeine: <CoffeeIcon style={iconsStyle}/>,
  }

  const handleSelect = (modelName, closeDialog) => {
    setSelected(modelName)
    navigateToModel({pathname: modelPath[modelName]}, navigate)
    closeDialog()
  }

  const stackSx = {
    // center the content of the stack
    justifyContent: 'center',
    alignItems: 'center',
  }

  return (
    <Grid
      container
      spacing={2}
      justifyContent='center'
      alignItems='center'
      sx={stackSx}
      data-testid={`dialog-open-model-samples`}
    >
      {Object.keys(modelPath).map((model, i) => (
        <Grid item xs={6} key={i} sx={{padding: '0.5em !important'}}>
          <Chip
            label={
              <>
                {modelIcon[model]}
                <Typography variant='caption' sx={{marginTop: '.5em'}}>{model}</Typography>
              </>
            }
            variant='sampleModel'
            onClick={() => handleSelect(model, () => setIsDialogDisplayed(false))}
            color='primary'
            data-testid={`sample-model-chip-${i}`}
          />
        </Grid>
      ))}
    </Grid>
  )
}

