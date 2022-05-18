import React from 'react'
import {TooltipIconButton} from './Buttons'
import CloseIcon from '../assets/2D_Icons/Close.svg'
import useStore from '../utils/store'


export const CommentsPanel = ()=> {
  const toggleIsCommentsOn = useStore((state) => state.toggleIsCommentsOn)
  return (
    <>
      <div style = {{display: 'flex', flexDirection: 'row'}}>
        <div style = {{width: '100%', height: '50px', background: 'white'}}>comments</div>
        <div>
          <TooltipIconButton
            title='toggle drawer'
            onClick={toggleIsCommentsOn}
            icon={<CloseIcon/>}/>
        </div>
      </div>
      <div style = {{width: '100%', height: '200px', background: 'lime', marginTop: '10px'}}>...</div>
    </>
  )
}


export const PropertiesPanel = ()=> {
  const toggleIsPropertiesOn = useStore((state) => state.toggleIsPropertiesOn)
  return (
    <>
      <div style = {{display: 'flex', flexDirection: 'row', marginTop: '10px'}}>
        <div style = {{width: '100%', height: '50px', background: 'white'}}>properties</div>
        <div>
          <TooltipIconButton
            title='toggle drawer'
            onClick={toggleIsPropertiesOn}
            icon={<CloseIcon/>}/>
        </div>
      </div>
      <div style = {{width: '100%', height: '200px', background: 'lime', marginTop: '10px'}}>...</div>
    </>
  )
}
