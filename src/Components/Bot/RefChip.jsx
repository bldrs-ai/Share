import React, {ReactElement, useMemo} from 'react'
import {Chip, Tooltip} from '@mui/material'
import {ViewInArOutlined as ElementIcon} from '@mui/icons-material'
import useStore from '../../store/useStore'
import {describeRef, jumpToRef} from '../../viewer/tools/refLinks'


/**
 * An element the assistant named, as a chip (#1673): a click selects and
 * frames it in place; it is a real link to the element's permalink, so a
 * middle- or modified click opens it in a tab, and "Copy link address" gives
 * a URL that opens Share on this model with the element selected. A mention
 * the open model can't resolve (the ref was invented, or belongs to another
 * model) renders disabled with the reason, never as a navigation.
 *
 * Resolved against the store at render and again when the viewer, model or
 * tree change, so a chip in a restored conversation enables once its model
 * has loaded.
 *
 * @property {string} refText the ref, as a tool returned it (`e123`…)
 * @property {*} children the label the reply gave it
 * @return {ReactElement}
 */
export default function RefChip({refText, children}) {
  const viewer = useStore((state) => state.viewer)
  const model = useStore((state) => state.model)
  const rootElement = useStore((state) => state.rootElement)
  // describeRef reads the store itself; these are its re-resolve triggers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const link = useMemo(() => describeRef(refText), [refText, viewer, model, rootElement])

  const onClick = (event) => {
    // Let the browser's own handling of a link win for open-in-new-tab.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return
    }
    event.preventDefault()
    try {
      jumpToRef(refText)
    } catch {
      // The model changed under the click (unloaded, ref gone): nothing moved.
    }
  }

  const chip = (
    <Chip
      size='small'
      variant='outlined'
      icon={<ElementIcon/>}
      label={children}
      disabled={!link.ok}
      // A span, not Chip's default div, which can't sit inside a paragraph.
      {...(link.ok ? {component: 'a', href: link.permalink, onClick, clickable: true} : {component: 'span'})}
      data-testid={link.ok ? 'BotChat-RefChip' : 'BotChat-RefChip-Disabled'}
      data-ref={refText}
      sx={{
        'maxWidth': '100%',
        'verticalAlign': 'middle',
        'textDecoration': 'none',
        '& .MuiChip-label': {display: 'inline', overflow: 'hidden', textOverflow: 'ellipsis'},
        '&.MuiChip-clickable:hover': {backgroundColor: (theme) => theme.palette.action.selected},
      }}
    />
  )
  // A disabled control swallows hover; the span carries the tooltip.
  return link.ok ? chip : <Tooltip title={link.reason}><span>{chip}</span></Tooltip>
}
