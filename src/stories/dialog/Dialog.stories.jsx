import React from 'react'
import {ControlButton} from '../../Components/Buttons'
import Dialog from '../../Components/Dialog_redesign'


export default {
  title: 'BLDRS UI/Dialogs/Open_Dialog',
  component: ControlButton,
  argTypes: {
    icon: {
      options: ['add', 'back', 'check', 'forward', 'help'],
      control: {
        type: 'select',
      },
      defaultValue: 'help',
    },
  },
}

const Template = (args) => {
  return <Dialog
    headerText={'Open file'}
    isDialogDisplayed={ true }
    setIsDialogDisplayed={() => {
      console.log('here')
    }}
    content={'hello'}
  />
}

export const Button = Template.bind({})
