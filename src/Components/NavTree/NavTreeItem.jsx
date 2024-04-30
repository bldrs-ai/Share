import clsx from 'clsx'
import React, {ReactElement} from 'react'
import {useTreeItem} from '@mui/lab/TreeItem'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import HideToggleButton from '../HideToggleButton'


/** @return {ReactElement} */
export default function CustomContent(props, ref) {
  const {
    classes,
    className,
    label,
    nodeId,
    icon: iconProp,
    expansionIcon,
    displayIcon,
    hasHideIcon,
    isExpandable,
    selectWithShiftClickEvents,
    idToRef,
  } = props

  const {
    disabled,
    expanded,
    selected,
    focused,
    handleExpansion,
    handleSelection,
    preventSelection,
  } = useTreeItem(nodeId)

  const icon = iconProp || expansionIcon || displayIcon

  const handleMouseDown = (event) => preventSelection(event)

  const handleExpansionClick = (event) => handleExpansion(event)

  const handleSelectionClick = (event) => {
    handleSelection(event)
    selectWithShiftClickEvents(event.shiftKey, parseInt(nodeId))
  }

  idToRef[nodeId] = ref

  // TODO(pablo): the following uses a measured value of 30px width for the
  // visiblity icon, to compute widths for a straight column layout of all of
  // the icons.  Thifs should either be an imported value or find a better way to
  // do the layout
  return (
    <Box
      className={clsx(className, classes.root, {
        [classes.expanded]: expanded,
        [classes.selected]: selected,
        [classes.focused]: focused,
        [classes.disabled]: disabled,
      })}
      ref={ref}
    >
      <Box
        onClick={handleExpansionClick}
        // visual match for text lead to match parent
        sx={{padding: isExpandable ? '0px 14px' : '0 0 0 1.15em'}}
      >
        {isExpandable && icon}
      </Box>
      <Stack direction='row' sx={{width: '300px'}}>
        <Box
          display='flex'
          onMouseDown={handleMouseDown}
          onClick={handleSelectionClick}
          sx={{
            width: hasHideIcon ? 'calc(100% - 30px)' : '100%',
          }}
        >
          <Typography variant='tree'>{label}</Typography>
        </Box>
        {hasHideIcon &&
         <Box display='flex' sx={{display: 'contents', width: '30px'}}>
           <HideToggleButton elementId={parseInt(nodeId)}/>
         </Box>
        }
      </Stack>
    </Box>
  )
}
