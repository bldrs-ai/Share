import React, {ReactElement, useState} from 'react'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  ButtonBase,
  Typography,
} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import {ChevronDown, FileText} from 'lucide-react'


const MODEL_CATEGORIES = [
  {
    name: 'BIM Whale',
    models: [
      {name: 'Basic House', path: 'bim-whale/BasicHouse.ifc'},
      {name: 'Simple Wall', path: 'bim-whale/SimpleWall.ifc'},
      {name: 'Many Walls', path: 'bim-whale/ManySimpleWalls.ifc'},
      {name: 'Tall Building', path: 'bim-whale/TallBuilding.ifc'},
      {name: 'Advanced Project', path: 'bim-whale/AdvancedProject.ifc'},
      {name: 'Large Building', path: 'bim-whale/LargeBuilding.ifc'},
    ],
  },
  {
    name: 'buildingSMART IFC4',
    models: [
      {name: 'Wall + Window', path: 'buildingSMART/ifc4-referenceview/wall-with-opening-and-window.ifc'},
      {name: 'Basin', path: 'buildingSMART/ifc4-referenceview/basin-tessellation.ifc'},
      {name: 'Column', path: 'buildingSMART/ifc4-referenceview/column-straight-rectangle-tessellation.ifc'},
      {name: 'Building Arch.', path: 'buildingSMART/ifc4-pcert/Building-Architecture.ifc'},
      {name: 'Building Struct.', path: 'buildingSMART/ifc4-pcert/Building-Structural.ifc'},
      {name: 'Bridge', path: 'buildingSMART/ifc4-pcert/Infra-Bridge.ifc'},
      {name: 'Road', path: 'buildingSMART/ifc4-pcert/Infra-Road.ifc'},
      {name: 'Rail', path: 'buildingSMART/ifc4-pcert/Infra-Rail.ifc'},
    ],
  },
  {
    name: 'buildingSMART Community',
    models: [
      {name: 'Schependomlaan', path: 'buildingSMART-community/schependomlaan/Schependomlaan.ifc'},
      {name: 'Duplex Arch.', path: 'buildingSMART-community/duplex-apartment/Duplex_A_20110907.ifc'},
      {name: 'Clinic Arch.', path: 'buildingSMART-community/medical-dental-clinic/Clinic_Architectural.ifc'},
      {name: 'Esplanades', path: 'buildingSMART-community/esplanades/Esplanades_AR.ifc'},
    ],
  },
  {
    name: 'OpenSource BIM',
    models: [
      {name: 'HHS Office Arch.', path: 'opensourceBIM/HHS-Office-architect.ifc'},
      {name: 'HHS Office MEP', path: 'opensourceBIM/HHS-Office-MEP.ifc'},
      {name: 'Schultz Residence', path: 'opensourceBIM/Schultz_Residence.ifc'},
    ],
  },
]


/**
 * @property {Function} navigate
 * @property {Function} setIsDialogDisplayed
 * @return {ReactElement}
 */
export default function LocalModels({navigate, setIsDialogDisplayed}) {
  const {navigateToModel} = require('../../utils/navigate')
  const theme = useTheme()
  const [expanded, setExpanded] = useState(MODEL_CATEGORIES[0].name)

  const handleSelect = (modelPath) => {
    navigateToModel({pathname: `/share/v/p/testdata/models/ifc/${modelPath}`}, navigate)
    setIsDialogDisplayed(false)
  }

  return (
    <Box sx={{maxHeight: '400px', overflow: 'auto', width: '100%'}}>
      {MODEL_CATEGORIES.map((cat) => (
        <Accordion
          key={cat.name}
          expanded={expanded === cat.name}
          onChange={(_, isExp) => setExpanded(isExp ? cat.name : '')}
          disableGutters
          elevation={0}
          sx={{
            '&:before': {display: 'none'},
            'backgroundColor': 'transparent',
            'backgroundImage': 'none',
          }}
        >
          <AccordionSummary
            expandIcon={<ChevronDown size={14} strokeWidth={1.5}/>}
            sx={{minHeight: 32, px: 1, py: 0}}
          >
            <Typography sx={{fontSize: '12px', fontWeight: 500}}>
              {cat.name}
              <Typography component='span' sx={{ml: 1, opacity: 0.4, fontSize: '11px'}}>
                ({cat.models.length})
              </Typography>
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{p: 0, px: 0, pb: 1}}>
            <Box sx={{display: 'flex', flexDirection: 'column', gap: '1px'}}>
              {cat.models.map((model, i) => (
                <ButtonBase
                  key={i}
                  onClick={() => handleSelect(model.path)}
                  sx={{
                    'display': 'flex',
                    'alignItems': 'center',
                    'gap': '0.5rem',
                    'width': '100%',
                    'padding': '4px 10px 4px 20px',
                    'borderRadius': '4px',
                    'textAlign': 'left',
                    'justifyContent': 'flex-start',
                    '&:hover': {background: theme.palette.action.hover},
                  }}
                >
                  <FileText size={12} strokeWidth={1.5} style={{opacity: 0.4, flexShrink: 0}}/>
                  <Typography sx={{fontSize: '12px'}}>{model.name}</Typography>
                </ButtonBase>
              ))}
            </Box>
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  )
}
