import React from 'react'
import FixtureContext from '../../FixtureContext'
import BldrsDialogTabs from './BldrsDialogTabs'
import AttentionIcon from '../../assets/icons/Attention.svg'


export default (
  <FixtureContext>
    <BldrsDialogTabs
      icon={<AttentionIcon className='icon-share'/>}
      headerText={'Here\'s the thing!'}
      isDialogDisplayed={true}
      // eslint-disable-next-line no-empty-function
      setIsDialogDisplayed={() => {}}
      content={'What you should know about doing the thing'}
      actionTitle={'Do do the thing?'}
      actionCb={() => {
        alert('You did the thing')
      }}
      tabNames={['Tab 1', 'Tab 2', 'Tab 3']}
    />
  </FixtureContext>
)
