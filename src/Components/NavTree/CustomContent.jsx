import clsx from 'clsx'
import React, {ReactElement} from 'react'
import {useTreeItem} from '@mui/lab/TreeItem'
import Box from '@mui/material/Box'
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
    // selectWithShiftClickEvents(event.shiftKey, nodeId)
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className={clsx(className, classes.root, {
        [classes.expanded]: expanded,
        [classes.selected]: selected,
        [classes.focused]: focused,
        [classes.disabled]: disabled,
      })}
      onMouseDown={handleMouseDown}
      ref={ref}
    >
      {isExpandable &&
       <Box
         onClick={handleExpansionClick}
         sx={{margin: '0px 14px'}}
       >
         {icon}
       </Box>
      }
      <div style={{width: '300px'}}>
        <Typography
          variant='tree'
          onClick={handleSelectionClick}
        >
          {label}
        </Typography>
        {hasHideIcon &&
         <div style={{display: 'contents'}}>
           <HideToggleButton elementId={nodeId}/>
         </div>
        }
      </div>
    </div>
  )
}
