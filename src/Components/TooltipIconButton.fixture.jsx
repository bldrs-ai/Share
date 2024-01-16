import React from 'react'
import {ThemeCtx} from '../theme/Theme.fixture'
import {TooltipIconButton} from './Buttons'
import ShareIcon from '../assets/icons/Share.svg'


export default (
  <ThemeCtx>
    <TooltipIconButton
      tooltip={'Hello World'}
      icon={<ShareIcon className='icon-share'/>}
      onClick={() => {
        // eslint-disable-next-line no-console
        console.log('clicked')
      }}
    />
  </ThemeCtx>
)
