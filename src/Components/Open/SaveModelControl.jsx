import React, {ReactElement, useState, useEffect} from 'react'
import {useNavigate} from 'react-router-dom'
import {getOrganizations} from '../../net/github/Organizations'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import useStore from '../../store/useStore'
import {ControlButton} from '../Buttons'
import SaveModelDialog from './SaveModelDialog'
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined'


/**
 * Displays model open dialog
 *
 * @return {ReactElement}
 */
export default function SaveModelControl() {
  const {user} = useAuth0()
  const navigate = useNavigate()
  const accessToken = useStore((state) => state.accessToken)
  const [isDialogDisplayed, setIsDialogDisplayed] = useState(false)
  const [orgNamesArr, setOrgNamesArray] = useState([''])


  useEffect(() => {
    /** @return {Array<string>} organizations */
    async function fetchOrganizations() {
      const orgs = await getOrganizations(accessToken)
      const orgNamesFetched = Object.keys(orgs).map((key) => orgs[key].login)
      const orgNames = [...orgNamesFetched, user && user.nickname]
      setOrgNamesArray(orgNames)
      return orgs
    }

    if (accessToken) {
      fetchOrganizations()
    }
  }, [accessToken, user])


  return (
    <ControlButton
      title='Save'
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      icon={<SaveOutlinedIcon className='icon-share'/>}
      placement='bottom'
    >
      <SaveModelDialog
        isDialogDisplayed={isDialogDisplayed}
        setIsDialogDisplayed={setIsDialogDisplayed}
        navigate={navigate}
        orgNamesArr={orgNamesArr}
      />
    </ControlButton>
  )
}
