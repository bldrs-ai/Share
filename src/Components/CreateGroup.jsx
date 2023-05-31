/* eslint-disable no-magic-numbers */
import React, {useState} from 'react'
import Paper from '@mui/material/Paper'
import ButtonGroup from '@mui/material/ButtonGroup'
// import RenderingControl from '../Components/RenderingControl'
import {TooltipIconButton} from './Buttons'
import RobotIcon1 from '../assets/icons/Robot1.svg'
import RobotIcon2 from '../assets/icons/Robot2.svg'
import RobotIcon3 from '../assets/icons/Robot3.svg'
import RobotIcon4 from '../assets/icons/Robot4.svg'
import RobotIcon5 from '../assets/icons/Robot5.svg'
import RobotIcon6 from '../assets/icons/Robot6.svg'


const icon = (iconNumber) => {
  if (iconNumber === 1) {
    return <RobotIcon1 style={{width: '22px', height: '22px'}}/>
  }
  if (iconNumber === 2) {
    return <RobotIcon2 style={{width: '22px', height: '22px'}}/>
  }
  if (iconNumber === 3) {
    return <RobotIcon3 style={{width: '22px', height: '22px'}}/>
  }
  if (iconNumber === 4) {
    return <RobotIcon4 style={{width: '22px', height: '22px'}}/>
  }
  if (iconNumber === 5) {
    return <RobotIcon5 style={{width: '22px', height: '22px'}}/>
  }
  if (iconNumber === 6) {
    return <RobotIcon6 style={{width: '22px', height: '22px'}}/>
  }
}

/**
 * OperationsGroup contains tools for sharing, notes, properties, cut
 * plane, deselect, theme change and about.
 *
 * @property {Function} deselectItems deselects currently selected element
 * @return {React.Component}
 */
export default function CreateGroup({deselectItems}) {
  const [iconNumber, setIconNumber] = useState(1)
  const iconNumberCalc = iconNumber < 6 ? iconNumber + 1 : 1

  return (
    <div>
      <Paper
        variant='control'
        sx={{
          'display': 'flex',
          'flexDirection': 'column',
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
            title={'A.I. Assistant ... comming soon'}
            onClick={() => setIconNumber(iconNumberCalc)}
            icon={icon(iconNumber)}
          />
        </ButtonGroup>
      </Paper>
    </div>
  )
}
