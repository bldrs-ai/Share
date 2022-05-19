import React from 'react'
import {TooltipIconButton} from './Buttons'
import CloseIcon from '../assets/2D_Icons/Close.svg'
import useStore from '../utils/store'
import ItemProperties from './ItemProperties'


export const CommentsPanel = ()=> {
  const toggleIsCommentsOn = useStore((state) => state.toggleIsCommentsOn)
  return (
    <>
      <div style = {{display: 'flex', flexDirection: 'row', marginTop: '10px'}}>
        <div style = {{
          width: '100%',
          height: '50px',
          background: 'white',
          display: 'flex',
          fontSize: '18px',
          fontWeight: 'bold',
          marginRight: '10px',
          paddingLeft: '2px',
          alignItems: 'center'}}>
            Comments
        </div>
        <div>
          <TooltipIconButton
            title='toggle drawer'
            onClick={toggleIsCommentsOn}
            icon={<CloseIcon/>}/>
        </div>
      </div>
      <div>
        <div style = {{width: '100%', height: '200px', background: 'yellow', marginTop: '10px'}}>...</div>
      </div>
    </>
  )
}


export const PropertiesPanel = ()=> {
  const toggleIsPropertiesOn = useStore((state) => state.toggleIsPropertiesOn)
  return (
    <>
      <div style = {{display: 'flex', flexDirection: 'row', marginTop: '10px'}}>
        <div style = {{
          width: '100%',
          height: '50px',
          background: 'white',
          display: 'flex',
          fontSize: '18px',
          fontWeight: 'bold',
          marginRight: '10px',
          paddingLeft: '2px',
          alignItems: 'center'}}>
            Properties
        </div>
        <div>
          <TooltipIconButton
            title='toggle drawer'
            onClick={toggleIsPropertiesOn}
            icon={<CloseIcon/>}/>
        </div>
      </div>
      <div>
        <ItemProperties />
      </div>
    </>
  )
}
