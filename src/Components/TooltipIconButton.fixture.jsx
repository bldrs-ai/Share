import React from 'react'
import FixtureContext from '../FixtureContext'
import {TooltipIconButton} from './Buttons'
import ShareIcon from '../assets/icons/Share.svg'


/** @return {React.Component} */
export default function Example() {
  return (
    <FixtureContext>
      <TooltipIconButton
        title={'Hello World'}
        icon={<ShareIcon className='icon-share'/>}
        onClick={() => {
          // eslint-disable-next-line no-console
          console.log('clicked')
        }}
      />
    </FixtureContext>
  )
}
