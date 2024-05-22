import React, {ReactElement, useState, useEffect} from 'react'
import {useNavigate} from 'react-router-dom'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {getOrganizations} from '../../net/github/Organizations'
import useStore from '../../store/useStore'
import {ControlButtonWithHashState} from '../Buttons'
import OpenModelDialog from './OpenModelDialog'
import {HASH_PREFIX_OPEN_MODEL} from './hashState'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'


/**
 * Displays Open Model dialog
 *
 * @return {ReactElement}
 */
export default function OpenModelControl() {
  const accessToken = useStore((state) => state.accessToken)

  const isOpenModelVisible = useStore((state) => state.isOpenModelVisible)
  const setIsOpenModelVisible = useStore((state) => state.setIsOpenModelVisible)

  const [orgNamesArr, setOrgNamesArray] = useState([''])

  const {user} = useAuth0()
  const navigate = useNavigate()


  useEffect(() => {
    /** Asynchronously fetch organizations */
    async function fetchOrganizations() {
      const orgs = await getOrganizations(accessToken)
      const orgNamesFetched = Object.keys(orgs).map((key) => orgs[key].login)
      const orgNames = [...orgNamesFetched, user && user.nickname]
      setOrgNamesArray(orgNames)
    }

    if (accessToken) {
      fetchOrganizations()
    }
  }, [accessToken, user])


  return (
    <ControlButtonWithHashState
      title='Open'
      icon={<FolderOpenIcon className='icon-share'/>}
      isDialogDisplayed={isOpenModelVisible}
      setIsDialogDisplayed={setIsOpenModelVisible}
      hashPrefix={HASH_PREFIX_OPEN_MODEL}
      placement='bottom'
    >
      <OpenModelDialog
        isDialogDisplayed={isOpenModelVisible}
        setIsDialogDisplayed={setIsOpenModelVisible}
        navigate={navigate}
        orgNamesArr={orgNamesArr}
      />
    </ControlButtonWithHashState>
  )
}
