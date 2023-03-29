import React from 'react'
import Dialog from './Dialog'
import AttentionIcon from '../assets/icons/Attention.svg'


export default (
  <Dialog
    icon={<AttentionIcon/>}
    headerText={'Here\'s the thing!'}
    isDialogDisplayed={true}
    // eslint-disable-next-line no-empty-function
    setIsDialogDisplayed={() => {}}
    content={'What you should know about doing the thing'}
    actionTitle={'Do do the thing?'}
    actionCb={() => {
      // eslint-disable-next-line no-alert
      alert('You did the thing')
    }}
  />
)
