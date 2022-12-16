import React from 'react'
import Dialog, {
  OpenDialogBodyContent,
} from '../../Components/Dialog_redesign'


export default {
  title: 'BLDRS UI/Dialogs',
  component: Dialog,
  argTypes: {},
}

const Template = (args) => {
  return <OpenDialogBodyContent />
}

export const OpenDialogBody = Template.bind({})
