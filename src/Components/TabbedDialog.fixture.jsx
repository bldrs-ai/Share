/* eslint-disable no-magic-numbers */
import React from 'react'
import Button from '@mui/material/Button'
import FixtureContext from '../FixtureContext'
import debug from '../utils/debug'
import TabbedDialog from './TabbedDialog'


const loremIpsum = (size) => `Lorem ipsum dolor sit amet, consectetur adipiscing elit,
      sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. `.repeat(size)


export default (
  <FixtureContext>
    <TabbedDialog
      tabLabels={['Explore', 'Open', 'Save']}
      headerLabels={['Explore Sample Projects', 'Open Project', 'Save Project']}
      contentComponents={[
        (<p key='1'>{loremIpsum(3)}<Button onClick={debug().log('clicked 1')}/></p>),
        (<p key='2'>{loremIpsum(2)}<Button onClick={debug().log('clicked 2')}/></p>),
        (<p key='3'>{loremIpsum(4)}<Button onClick={debug().log('clicked 3')}/></p>),
      ]}
      isDialogDisplayed={true}
      setIsDialogDisplayed={() => debug().log('setIsDialogDisplayed')}
    />
  </FixtureContext>
)
