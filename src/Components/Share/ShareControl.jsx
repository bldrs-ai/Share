import React, {ReactElement, useState} from 'react'
import {Link, Typography} from '@mui/material'
import {useAuth0} from '../../Auth0/Auth0Proxy'
import {useStartGateLogin} from '../../Auth0/gateLogin'
import useStore from '../../store/useStore'
import {
  GATE_EVENTS,
  MODEL_ACTIONS,
  MODEL_GATES,
  MODEL_ROUTE_KINDS,
  MODEL_SOURCES,
  gtagEventWithCid,
  trackModelAction,
} from '../../privacy/analytics'
import {ControlButtonWithHashState, TooltipIconButton} from '../Buttons'
import GatedAction from '../GatedAction'
import {HASH_PREFIX_SHARE} from './hashState'
import {ShareOutlined as ShareIcon} from '@mui/icons-material'
import ShareDialog from './ShareDialog'


/**
 * This button hosts the ShareDialog component and toggles it open and
 * closed.
 *
 * For a model opened from the user's computer (a `/share/v/local-only/<id>` route)
 * the button is gated instead (#705): the upload lives only in this browser's
 * OPFS, so the link the dialog would hand out opens nowhere else — a
 * recipient gets the raw "Folder <id> not found" error, Sentry's top
 * hard-failure group (SHARE-1NR, #1955). The button keeps its slot in the
 * dimmed `GatedAction` look, and a click says why and offers the Open
 * dialog, whose GitHub and Google Drive tabs are the ways to open a model
 * that CAN be shared.
 *
 * Provenance comes from the ROUTE (`modelPath.isUploadedFile`, set by
 * routes.ts#processFile), not the loader's `model.isUploadedFile`: the
 * loader's flag is a UUID-in-the-path heuristic that also matches a hosted
 * model named `<uuid>.ifc`, which shares fine.
 *
 * The gate also measures intent (Share#1964): `share_gated{reason,
 * signed_in}` when its help opens; a "Save to Google Drive or GitHub to
 * share — coming soon" line whose click is `share_interest`, the demand
 * signal for save-to-cloud as the sign-up moment (bizdev#333); and, for a
 * signed-out user, a Sign in action attributed to the gate in `login`
 * (Auth0/gateLogin.js).
 *
 * @return {ReactElement} The button react component, with a hosted
 *   ShareDialog component
 */
export default function ShareControl() {
  const isShareVisible = useStore((state) => state.isShareVisible)
  const setIsShareVisible = useStore((state) => state.setIsShareVisible)
  const setIsOpenModelVisible = useStore((state) => state.setIsOpenModelVisible)
  const isLocalUpload = useStore((state) => state.modelPath?.isUploadedFile === true)
  const {isAuthenticated} = useAuth0()
  const startGateLogin = useStartGateLogin()
  // Per opening of the help: the interest line becomes a thank-you once
  // clicked, so one opening counts at most one `share_interest`.
  const [isInterestNoted, setIsInterestNoted] = useState(false)

  if (isLocalUpload) {
    const onInterestClick = () => {
      if (isInterestNoted) {
        return
      }
      setIsInterestNoted(true)
      gtagEventWithCid(GATE_EVENTS.SHARE_INTEREST, {feature: 'save_to_cloud', signed_in: isAuthenticated})
    }
    // No ShareDialog is mounted here, so a `#share:` hash or a store flag
    // left over from an earlier model can't open it either.
    return (
      <GatedAction
        slug='share'
        title={MSG_LOCAL_SHARE_TITLE}
        body={MSG_LOCAL_SHARE_BODY}
        extra={
          <Typography variant='body2' data-testid='share-coming-soon'>
            {isInterestNoted ?
              MSG_SHARE_INTEREST_NOTED :
              <Link
                component='button'
                variant='body2'
                onClick={onInterestClick}
                data-testid='share-interest'
                sx={{textAlign: 'left'}}
              >
                {MSG_SHARE_COMING_SOON}
              </Link>}
          </Typography>
        }
        actionLabel='Open a file'
        onAction={() => setIsOpenModelVisible(true)}
        secondaryActionLabel={isAuthenticated ? undefined : 'Sign in'}
        onSecondaryAction={isAuthenticated ? undefined : () => startGateLogin('share')}
        onOpen={() => {
          setIsInterestNoted(false)
          gtagEventWithCid(GATE_EVENTS.SHARE_GATED, {reason: 'local_file', signed_in: isAuthenticated})
          // Its normalized twin: a share the local-file gate turned into an
          // upsell (design/new/quotas.md §"Analytics: normalized tier events").
          trackModelAction(MODEL_ACTIONS.SHARE, {
            gate: MODEL_GATES.UPSELL,
            source: MODEL_SOURCES.LOCAL,
            routeKind: MODEL_ROUTE_KINDS.LOCAL,
            isAuthenticated,
            appMetadata: useStore.getState().appMetadata,
          })
        }}
      >
        {/* The real toolbar button, dimmed and inert, under the same test id
            — same pattern as SaveModelControl's signed-out gate. GatedAction
            owns the click; this handler never runs. */}
        <TooltipIconButton
          title='Share'
          onClick={() => setIsShareVisible(true)}
          icon={<ShareIcon className='icon-share'/>}
          placement='bottom'
          variant='control'
          color='success'
          size='small'
          dataTestId='control-button-share'
        />
      </GatedAction>
    )
  }

  return (
    <ControlButtonWithHashState
      title='Share'
      icon={<ShareIcon className='icon-share'/>}
      isDialogDisplayed={isShareVisible}
      setIsDialogDisplayed={setIsShareVisible}
      hashPrefix={HASH_PREFIX_SHARE}
      placement='bottom'
    >
      <ShareDialog
        isDialogDisplayed={isShareVisible}
        setIsDialogDisplayed={setIsShareVisible}
      />
    </ControlButtonWithHashState>
  )
}


export const MSG_LOCAL_SHARE_TITLE = 'Local-only files can\'t be shared yet'
// "Open it from GitHub or Google Drive" is the same way out the no-OPFS
// alert offers (OPFS/messages.js), so local-file limits read alike.
export const MSG_LOCAL_SHARE_BODY =
  'This model was opened from a file on your computer, so it\'s local-only: it\'s kept only in ' +
  'this browser, and a link to it won\'t open anywhere else. Open it from GitHub or Google Drive to share it.'
export const MSG_SHARE_COMING_SOON = 'Save to Google Drive or GitHub to share — coming soon'
export const MSG_SHARE_INTEREST_NOTED = 'Thanks — we\'ve noted your interest.'
