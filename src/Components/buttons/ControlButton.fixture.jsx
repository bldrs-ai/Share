import React, {useState} from 'react'
import {ControlButton} from '../../Components/Buttons'
import Announcement from '@mui/icons-material/Announcement'
import Dialog from '../../Components/Dialog'


/**
 * @property {string} title Title of the button
 * @return {React.Component}
 */
export default function ControlButtonFixture({title}) {
  const [isDialogDisplayed, setIsDialogDisplayed] = useState(true)
  const dialog = (
    <Dialog
      icon={<Announcement/>}
      headerText={'Example Dialog'}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      content={'Example content.'}
      actionTitle={'Action title.'}
      actionCb={() => console.log('action callback')}
      actionIcon={<Announcement/>}
    />
  )


  return (
    <ControlButton
      title={title}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      icon={<Announcement/>}
      dialog={dialog}
      placement={'left'}
    />)
}
