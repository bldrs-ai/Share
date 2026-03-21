import React, {ReactElement, useState} from 'react'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Chip,
  Grid,
  Typography,
} from '@mui/material'
import {
  ExpandMore as ExpandMoreIcon,
  InsertDriveFileOutlined as FileIcon,
} from '@mui/icons-material'


/**
 * Curated local IFC test models from testdata/models/ifc/.
 * Organized by source/category.
 */
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
      {name: 'Tessellated Item', path: 'buildingSMART/ifc4-referenceview/tessellated-item.ifc'},
      {name: 'Colored Tessellation', path: 'buildingSMART/ifc4-referenceview/tessellation-with-individual-colors.ifc'},
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
      {name: 'Duplex Electrical', path: 'buildingSMART-community/duplex-apartment/Duplex_Electrical_20121207.ifc'},
      {name: 'Duplex MEP', path: 'buildingSMART-community/duplex-apartment/Duplex_MEP_20110907.ifc'},
      {name: 'Clinic Arch.', path: 'buildingSMART-community/medical-dental-clinic/Clinic_Architectural.ifc'},
      {name: 'Clinic Struct.', path: 'buildingSMART-community/medical-dental-clinic/Clinic_Structural.ifc'},
      {name: 'Esplanades', path: 'buildingSMART-community/esplanades/Esplanades_AR.ifc'},
    ],
  },
  {
    name: 'IFC Spec Archive',
    models: [
      {name: 'Wall Standard', path: 'buildingSMART-community/iso-spec-archive/wall-standard-case.ifc'},
      {name: 'Beam Extruded', path: 'buildingSMART-community/iso-spec-archive/beam-extruded-solid.ifc'},
      {name: 'Column Extruded', path: 'buildingSMART-community/iso-spec-archive/column-extruded-solid.ifc'},
      {name: 'Slab Standard', path: 'buildingSMART-community/iso-spec-archive/slab-standard-case.ifc'},
      {name: 'Slab Openings', path: 'buildingSMART-community/iso-spec-archive/slab-openings.ifc'},
      {name: 'CSG Primitive', path: 'buildingSMART-community/iso-spec-archive/csg-primitive.ifc'},
      {name: 'BREP Model', path: 'buildingSMART-community/iso-spec-archive/brep-model.ifc'},
      {name: 'Basin Adv. BREP', path: 'buildingSMART-community/iso-spec-archive/basin-advanced-brep.ifc'},
    ],
  },
  {
    name: 'OpenSource BIM',
    models: [
      {name: 'HHS Office Arch.', path: 'opensourceBIM/HHS-Office-architect.ifc'},
      {name: 'HHS Office MEP', path: 'opensourceBIM/HHS-Office-MEP.ifc'},
      {name: 'HHS Office Constr.', path: 'opensourceBIM/HHS-Office-construction.ifc'},
      {name: 'Schultz Residence', path: 'opensourceBIM/Schultz_Residence.ifc'},
      {name: 'Texture Test', path: 'opensourceBIM/IfcTextureTest.ifc'},
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
  const [expanded, setExpanded] = useState(MODEL_CATEGORIES[0].name)

  const handleSelect = (modelPath) => {
    navigateToModel({pathname: `/share/v/p/testdata/models/ifc/${modelPath}`}, navigate)
    setIsDialogDisplayed(false)
  }

  return (
    <div style={{maxHeight: '400px', overflow: 'auto', width: '100%'}}>
      {MODEL_CATEGORIES.map((cat) => (
        <Accordion
          key={cat.name}
          expanded={expanded === cat.name}
          onChange={(_, isExpanded) => setExpanded(isExpanded ? cat.name : '')}
          disableGutters
          elevation={0}
          sx={{
            '&:before': {display: 'none'},
            'backgroundColor': 'transparent',
          }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon/>} sx={{minHeight: 36, px: 1}}>
            <Typography variant='caption' sx={{fontWeight: 600, fontSize: '12px'}}>
              {cat.name}
              <Typography component='span' variant='caption' sx={{ml: 1, opacity: 0.4, fontSize: '11px'}}>
                ({cat.models.length})
              </Typography>
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{p: 0, px: 1, pb: 1}}>
            <Grid container spacing={0.5}>
              {cat.models.map((model, i) => (
                <Grid item xs={6} key={i}>
                  <Chip
                    icon={<FileIcon sx={{fontSize: 14}}/>}
                    label={model.name}
                    size='small'
                    onClick={() => handleSelect(model.path)}
                    sx={{
                      'width': '100%',
                      'justifyContent': 'flex-start',
                      'fontSize': '11px',
                      'height': '28px',
                      '& .MuiChip-label': {
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      },
                    }}
                    variant='outlined'
                  />
                </Grid>
              ))}
            </Grid>
          </AccordionDetails>
        </Accordion>
      ))}
    </div>
  )
}
