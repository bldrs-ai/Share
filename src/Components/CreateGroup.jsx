import React, {useState} from 'react'
import Paper from '@mui/material/Paper'
import ButtonGroup from '@mui/material/ButtonGroup'
// import RenderingControl from '../Components/RenderingControl'
import {TooltipIconButton} from './Buttons'
import RobotIcon from '../assets/icons/Robot.svg'

/**
 * OperationsGroup contains tools for sharing, notes, properties, cut
 * plane, deselect, theme change and about.
 *
 * @property {Function} deselectItems deselects currently selected element
 * @return {React.Component}
 */
export default function CreateGroup({deselectItems}) {
  const [show, setShow] = useState(true)
  return (
    <div>
      <Paper
        variant='control'
        sx={{
          'display': 'flex',
          'flexDirection': 'column',
          'opacity': .9,
          '.MuiButtonGroup-root + .MuiButtonGroup-root': {
            borderRadius: 0,
          },
        }}
      >
        <ButtonGroup
          orientation='vertical'
        >
          {/* <RenderingControl/> */}
          <TooltipIconButton
            title={'A.I. Assistant'}
            onClick={() => setShow(!show)}
            icon={<RobotIcon style={{width: '18px', height: '18px'}}/>}
          />
        </ButtonGroup>
      </Paper>
    </div>
  )
}
