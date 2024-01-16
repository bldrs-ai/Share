import React, {useState} from 'react'
import AnnouncementIcon from '@mui/icons-material/Announcement'
import {ThemeCtx} from '../../theme/Theme.fixture'
import {ControlButton} from '../Buttons'


/**
 * Demo controlled component with open/close.
 *
 * @return {React.Component}
 */
export default function ControlButtonFixture() {
  const [isDisplayed, setIsDisplayed] = useState(false)
  return (
    <ThemeCtx>
      <ControlButton
        icon={<AnnouncementIcon className='icon-share'/>}
        tooltip={'title'}
        isDialogDisplayed={isDisplayed}
        setIsDialogDisplayed={setIsDisplayed}
        placement={'left'}
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
      />
    </ThemeCtx>
  )
}
