import React, {useEffect, useState} from 'react'
import Box from '@mui/material/Box'
import useTheme from '@mui/styles/useTheme'
import {useAuth0} from '@auth0/auth0-react'
import Dialog from './Dialog'
import {TooltipIconButton} from './Buttons'
import useStore from '../store/useStore'
import {getOrganizations} from '../utils/GitHub'
import RenderingIcon from '../assets/icons/Rendering.svg'
import LogoBuildings from '../assets/Logo_Buildings.svg'
import RobotIcon from '../assets/icons/Robot.svg'
import InputBar from './InputBar'

/**
 * Displays model Save dialog.
 *
 * @return {React.ReactElement}
 */
export default function RenderingControl({fileSave, modelPath}) {
  const [isDialogDisplayed, setIsDialogDisplayed] = useState(false)
  const {user} = useAuth0()
  const accessToken = useStore((state) => state.accessToken)
  useEffect(() => {
    /**
     * Asynchronously fetch organizations
     *
     * @return {Array} organizations
     */
    async function fetchOrganizations() {
      const orgs = await getOrganizations(accessToken)
      return orgs
    }

    if (accessToken) {
      fetchOrganizations()
    }
  }, [accessToken, user])


  return (
    <Box >
      <TooltipIconButton
        title={'A.I Rendering'}
        onClick={() => setIsDialogDisplayed(true)}
        icon={
          <RenderingIcon
            style={{
              paddingTop: '4px',
              width: '40px',
              height: '40px',
            }}
          />}
        placement={'right'}
        selected={isDialogDisplayed}
        dataTestId='Save-ifc'
      />
      {isDialogDisplayed &&
        <RenderingDialog
          isDialogDisplayed={isDialogDisplayed}
          setIsDialogDisplayed={setIsDialogDisplayed}
        />
      }
    </Box>
  )
}


/**
 * @param {boolean} isDialogDisplayed
 * @param {Function} setIsDialogDisplayed
 * @return {object} React component
 */
function RenderingDialog({isDialogDisplayed, setIsDialogDisplayed}) {
  // const [inputText, setInputText] = useState('')
  // const onInputChange = (event) => setInputText(event.target.value)
  // const searchInputRef = useRef(null)
  const theme = useTheme()

  return (
    <Dialog
      icon={<RenderingIcon style={{width: '19px', height: '19px'}}/>}
      headerText={'A.I. Rendering'}
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      actionTitle={'Render'}
      actionCb={() => setIsDialogDisplayed(false)}
      content={
        <Box
          sx={{
            width: '260px',
            paddingTop: '6px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Box
            sx={{
              width: '260px',
              height: '220px',
              display: 'flex',
              marginTop: '2px',
              justifyContent: 'center',
              alignItems: 'center',
              borderRadius: '4px',
              // border: '1px solid gray',
            }}
          >
            <LogoBuildings style={{width: '280px', height: '100px'}}/>
          </Box>
          <Box
            sx={{
              ...theme.typography.tree,
              'border': '1px solid gray',
              'marginTop': '20px',
              'width': '260px',
              'borderRadius': '5px',
              '& input::placeholder': {
                opacity: .5,
              },
            }}
          >
            <InputBar
              startAdorment={
                <RobotIcon
                  style={{
                    width: '20px',
                    height: '20px',
                    opacity: .9,
                    cursor: 'pointer',
                  }}
                  onClick={() => window.open('https://discord.com/channels/853953158560743424/941680912293314570', '_blank').focus()}
                />
              }
              placeholder={'Description'}
            />
          </Box>
          <Box
            sx={{
              marginTop: '1em',
              fontSize: '.8em',
              textAlign: 'left',
            }}
          >
            * Example: puffy cloud, red sun, green grass
          </Box>
        </Box>
      }
    />
  )
}
