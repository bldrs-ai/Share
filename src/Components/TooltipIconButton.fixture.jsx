import React from 'react'
import {TooltipIconButton} from './Buttons'
import ShareIcon from '../assets/icons/Share.svg'


export default (
  <TooltipIconButton title={'Hello World'} icon={<ShareIcon/>} onClick={() => console.log('clicked')}/>
)
