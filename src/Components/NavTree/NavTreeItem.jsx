import React, {forwardRef} from 'react'
import clsx from 'clsx'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import HideToggleButton from '../HideToggleButton'
import NodeClosedIcon from '../../assets/icons/NodeClosed.svg'
import NodeOpenIcon from '../../assets/icons/NodeOpened.svg'
import {navTreeItemPropTypes} from './PropTypes'


const NavTreeItem = forwardRef(function NavTreeItem(props, ref) {
  const {
    // eslint-disable-next-line no-unused-vars
    classes,
    className,
    label,
    nodeId,
    isExpandable,
    isExpanded,
    hasHideIcon,
    // eslint-disable-next-line no-unused-vars
    selectWithShiftClickEvents,
    idToRef,
    onIconClick,
    onClick,
    nodeDepth,
    isSelected,
  } = props

  const icon = isExpanded ? (
    <NodeOpenIcon className="icon-share icon-nav-caret"/>
  ) : (
    <NodeClosedIcon className="icon-share icon-nav-caret"/>
  )

  if (idToRef) {
    idToRef[nodeId] = ref
  }

  const handleMouseDown = (event) => {
    // Prevent text selection on double-click
    event.preventDefault()
  }

  return (
    <Box
      className={clsx(className)}
      ref={ref}
      sx={{
        display: 'flex',
        alignItems: 'center',
        // eslint-disable-next-line no-magic-numbers
        paddingLeft: nodeDepth * 20,
        width: '100%',
      }}
    >
      {isExpandable ? (
        <Box onClick={onIconClick} sx={{marginRight: 1, cursor: 'pointer'}}>
          {icon}
        </Box>
      ) : (
        <Box sx={{width: 24, marginRight: 1}}/>
      )}
      <Stack direction="row" sx={{flexGrow: 1, alignItems: 'center'}}>
        <Box
          onMouseDown={handleMouseDown}
          onClick={onClick}
          sx={{
            flexGrow: 1,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            backgroundColor: isSelected ? 'rgba(0, 0, 0, 0.08)' : 'transparent',
          }}
        >
          <Typography variant="body2">{label}</Typography>
        </Box>
        {hasHideIcon && (
          <Box sx={{display: 'flex', alignItems: 'center'}}>
            <HideToggleButton elementId={parseInt(nodeId, 10)}/>
          </Box>
        )}
      </Stack>
    </Box>
  )
})

NavTreeItem.propTypes = navTreeItemPropTypes

export default NavTreeItem
