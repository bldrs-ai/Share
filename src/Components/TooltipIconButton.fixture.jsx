import React from 'react'
import {TooltipIconButton} from './Buttons'
import ShareIcon from '../assets/icons/Share.svg'


export default (
  // eslint-disable-next-line no-console
  <TooltipIconButton title={'Hello World'} icon={<ShareIcon/>} onClick={() => console.log('clicked')}/>
)
