import React, {ReactElement} from 'react'
import useStore from '../../store/useStore'
import {gtagEvent} from '../../privacy/analytics'
import {ControlButtonWithHashState, TooltipIconButton} from '../Buttons'
import GatedAction from '../GatedAction'
import {HASH_PREFIX_SHARE} from './hashState'
import {ShareOutlined as ShareIcon} from '@mui/icons-material'
import ShareDialog from './ShareDialog'


/**
 * This button hosts the ShareDialog component and toggles it open and
 * closed.
 *
 * For a model opened from the user's computer (a `/share/v/new/<id>` route)
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
 * @return {ReactElement} The button react component, with a hosted
 *   ShareDialog component
 */
export default function ShareControl() {
  const isShareVisible = useStore((state) => state.isShareVisible)
  const setIsShareVisible = useStore((state) => state.setIsShareVisible)
  const setIsOpenModelVisible = useStore((state) => state.setIsOpenModelVisible)
  const isLocalUpload = useStore((state) => state.modelPath?.isUploadedFile === true)

  if (isLocalUpload) {
    // No ShareDialog is mounted here, so a `#share:` hash or a store flag
    // left over from an earlier model can't open it either.
    return (
      <GatedAction
        slug='share'
        title={MSG_LOCAL_SHARE_TITLE}
        body={MSG_LOCAL_SHARE_BODY}
        actionLabel='Open a file'
        onAction={() => setIsOpenModelVisible(true)}
        onOpen={() => gtagEvent('share_gated', {reason: 'local_file'})}
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


export const MSG_LOCAL_SHARE_TITLE = 'Local files can\'t be shared yet'
// "Open it from GitHub or Google Drive" is the same way out the no-OPFS
// alert offers (OPFS/messages.js), so local-file limits read alike.
export const MSG_LOCAL_SHARE_BODY =
  'This model was opened from a file on your computer, so it\'s kept only in this browser ' +
  'and a link to it won\'t open anywhere else. Open it from GitHub or Google Drive to share it.'
