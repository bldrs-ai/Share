import React from 'react'
import Dialog, {SampleModelsHeaderContent, SampleModelsBodyContent} from '../../Components/Dialog_redesign'


export default {
  title: 'BLDRS UI/Dialogs/Sample_Models_Dialog',
  component: Dialog,
}

const Template = (args) => {
  return <Dialog
    headerContent={<SampleModelsHeaderContent/>}
    bodyContent={<SampleModelsBodyContent/>}
    headerText={'Open file'}
    isDialogDisplayed={ true }
    setIsDialogDisplayed={() => {}}
  />
}

export const SampleModelsDialog = Template.bind({})
