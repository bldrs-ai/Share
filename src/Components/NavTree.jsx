import React from 'react'
import clsx from 'clsx'
import PropTypes from 'prop-types'
import {reifyName} from '@bldrs-ai/ifclib'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import TreeItem, {useTreeItem} from '@mui/lab/TreeItem'
import useStore from '../store/useStore'
import HideToggleButton from './HideToggleButton'


const NavTreePropTypes = {
  /**
   * Override or extend the styles applied to the component.
   */
  classes: PropTypes.object.isRequired,
  /**
   * className applied to the root element.
   */
  className: PropTypes.string,
  /**
   * The icon to display next to the tree node's label. Either a parent or end icon.
   */
  displayIcon: PropTypes.node,
  /**
   * The icon to display next to the tree node's label. Either an expansion or collapse icon.
   */
  expansionIcon: PropTypes.node,
  /**
   * The icon to display next to the tree node's label.
   */
  icon: PropTypes.node,
  /**
   * The tree node label.
   */
  label: PropTypes.node,
  /**
   * The id of the node.
   */
  nodeId: PropTypes.string.isRequired,
  /**
   * Determines if the tree node has a hide icon.
   */
  hasHideIcon: PropTypes.bool,
}

/**
 * @param {object} model IFC model
 * @param {object} element IFC element of the model
 * @param {string} pathPrefix URL prefix for constructing links to
 *   elements, recursively grown as passed down the tree
 * @return {object} React component
 */
export default function NavTree({
  model,
  element,
  pathPrefix,
  selectWithShiftClickEvents,
}) {
  const CustomContent = React.forwardRef(function CustomContent(props, ref) {
    const {
      classes,
      className,
      label,
      nodeId,
      icon: iconProp,
      expansionIcon,
      displayIcon,
      hasHideIcon,
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
      selectWithShiftClickEvents(event.shiftKey, element.expressID)
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
        <Box
          onClick={handleExpansionClick}
          sx={{margin: '0px 14px 0px 14px'}}
        >
          {icon}
        </Box>
        <div style={{width: '300px'}}>
          <Typography
            variant='tree'
            onClick={handleSelectionClick}
          >
            {label}
          </Typography>
          {hasHideIcon &&
            <div style={{display: 'contents'}}>
              <HideToggleButton elementId={element.expressID}/>
            </div>
          }
        </div>
      </div>
    )
  })

  CustomContent.propTypes = NavTreePropTypes

  const CustomTreeItem = (props) => {
    return <TreeItem ContentComponent={CustomContent} {...props}/>
  }

  const viewer = useStore((state) => state.viewer)

  const hasHideIcon = viewer.isolator.canBeHidden(element.expressID)

  let i = 0
  // TODO(pablo): Had to add this React.Fragment wrapper to get rid of
  // warning about missing a unique key foreach item.  Don't really understand it.
  return (
    <CustomTreeItem
      nodeId={element.expressID.toString()}
      label={reifyName({properties: model}, element)}
      ContentProps={{
        hasHideIcon: hasHideIcon,
      }}
    >
      {element.children && element.children.length > 0 ?
        element.children.map((child) => {
          const childKey = `${pathPrefix}-${i++}`
          return (
            <React.Fragment key={childKey}>
              <NavTree
                model={model}
                element={child}
                pathPrefix={pathPrefix}
                selectWithShiftClickEvents={selectWithShiftClickEvents}
              />
            </React.Fragment>
          )
        }) :
        null}
    </CustomTreeItem>
  )
}
