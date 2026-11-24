import React, {ReactElement, useEffect} from 'react'
import {useNavigate} from 'react-router-dom'
import {Button, Typography} from '@mui/material'
import {CloudOffOutlined as CloudOffIcon} from '@mui/icons-material'
import {LOCAL_ONLY_MODE_NAME, isLocalOnlyLevel} from '../../privacy/localOnlyMode'
import useStore from '../../store/useStore'
import {navigateToModel} from '../../utils/navigate'
import Dialog from '../Dialog'


/** Where a refused model lives, as the dialog names it. */
const SOURCE_NAMES = Object.freeze({
  github: 'on GitHub',
  google: 'on Google Drive',
  url: 'at a web address',
})


export const LOCAL_ONLY_TITLE = LOCAL_ONLY_MODE_NAME


/**
 * Shown when local-only mode refused a remote model link (Share.jsx sets
 * `blockedRemoteModel`; privacy/localOnlyMode.js). It says why, and offers
 * the privacy settings: the consent banner (About/ConsentBanner.jsx). If the
 * visitor accepts there, the refused link opens; if they decline, it stays
 * refused and this dialog comes back so they know nothing happened.
 *
 * Hidden while the banner is up, so the choice is made there, not over it.
 *
 * @return {ReactElement}
 */
export default function LocalOnlyDialog() {
  const navigate = useNavigate()
  const blocked = useStore((state) => state.blockedRemoteModel)
  const setBlocked = useStore((state) => state.setBlockedRemoteModel)
  const isBannerVisible = useStore((state) => state.isConsentBannerVisible)
  const setIsBannerVisible = useStore((state) => state.setIsConsentBannerVisible)
  const privacyLevel = useStore((state) => state.privacyLevel)

  // The visitor accepted: open the link they came for. Cleared first, so the route effect's own check (which
  // now passes) can't find a stale refusal.
  useEffect(() => {
    if (blocked && !isBannerVisible && !isLocalOnlyLevel(privacyLevel)) {
      setBlocked(null)
      navigateToModel(blocked.path, navigate)
    }
  }, [blocked, isBannerVisible, privacyLevel, setBlocked, navigate])

  const isOpen = Boolean(blocked) && !isBannerVisible && isLocalOnlyLevel(privacyLevel)
  const where = SOURCE_NAMES[blocked?.source] ?? 'elsewhere'
  const close = () => setBlocked(null)
  return (
    <Dialog
      headerIcon={<CloudOffIcon className='icon-share'/>}
      headerText={LOCAL_ONLY_TITLE}
      isDialogDisplayed={isOpen}
      setIsDialogDisplayed={(isDisplayed) => isDisplayed || close()}
      actionTitle={
        <>
          <Button variant='outlined' onClick={close} data-testid='local-only-not-now'>
            Not now
          </Button>
          <Button
            variant='contained'
            color='accent'
            onClick={() => setIsBannerVisible(true)}
            data-testid='local-only-privacy-settings'
          >
            Privacy settings
          </Button>
        </>
      }
    >
      <Typography variant='body1' data-testid='local-only-message'>
        This model is {where}. In {LOCAL_ONLY_MODE_NAME}, Bldrs Share opens files from your computer and
        the sample models. To open it, accept analytics in the privacy settings.
      </Typography>
    </Dialog>
  )
}
