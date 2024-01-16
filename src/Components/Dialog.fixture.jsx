import React from 'react'
import {ThemeCtx} from '../theme/Theme.fixture'
import Dialog from './Dialog'
import AttentionIcon from '../assets/icons/Attention.svg'


export const exampleHeaderText = 'Here\'s the thing!'

export default (
  <ThemeCtx>
    <Dialog
      headerIcon={<AttentionIcon className='icon-share'/>}
      headerText={exampleHeaderText}
      isDialogDisplayed={true}
      // eslint-disable-next-line no-empty-function
      setIsDialogDisplayed={() => {}}
      content={'What you should know about doing the thing'}
      actionTitle={'Do the thing?'}
      actionCb={() => {
        alert('You did the thing')
      }}
    />
  </ThemeCtx>
)

