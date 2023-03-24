import React, {useState} from 'react'
import {ControlButton} from '../../Components/Buttons'
import AnnouncementIcon from '@mui/icons-material/Announcement'


/**
 * Demo controlled component with open/close.
 *
 * @return {React.Component}
 */
export default function Control() {
  const [isDisplayed, setIsDisplayed] = useState(false)
  return (
    <ControlButton
      title={'title'}
      isDialogDisplayed={isDisplayed}
      setIsDialogDisplayed={setIsDisplayed}
      icon={<AnnouncementIcon/>}
      dialog={
        <div style={{border: 'solid 1px black'}}>
          {isDisplayed ?
           <div>
             <h1>Controlled component</h1>
             <button onClick={() => setIsDisplayed(false)}>Close</button>
           </div> :
           null}
        </div>
      }
      placement={'left'}
    />
  )
}
