import React from 'react'
import {ThemeCtx} from '../theme/Theme.fixture'
import {TooltipIconButton} from './Buttons'
import ShareIcon from '../assets/icons/Share.svg'


/** @return {React.Component} */
export default function Example() {
  return (
    <ThemeCtx>
      <TooltipIconButton
        title={'Hello World'}
        icon={<ShareIcon className='icon-share'/>}
        onClick={() => {
          // eslint-disable-next-line no-console
          console.log('clicked')
        }}
      />
    </ThemeCtx>
  )
}
