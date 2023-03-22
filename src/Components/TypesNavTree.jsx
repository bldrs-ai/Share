import React from 'react'
import NavTree from './NavTree'
import PropTypes from 'prop-types'
import TreeItem, {useTreeItem} from '@mui/lab/TreeItem'
import clsx from 'clsx'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import HideIcon from './HideIcon'


const TypesNavTreePropTypes = {
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
  /**
   * The name of the type.
   */
  typeName: PropTypes.string.isRequired,
}

/**
 * @param {object} model IFC model
 * @param {object} collection of element types
 * @param {string} pathPrefix URL prefix for constructing links to
 *   elements, recursively grown as passed down the tree
 * @return {object} React component
 */
export default function TypesNavTree({
  model,
  types,
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
      typeName,
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
      // selectWithShiftClickEvents(event.shiftKey, element.expressID)
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
        <div style={{width: '80%'}}>
          <Typography
            variant='tree'
            onClick={handleSelectionClick}
          >
            {label}
          </Typography>
          {hasHideIcon &&
            <div style={{display: 'contents'}}>
              <HideIcon elementId={typeName}/>
            </div>
          }
        </div>
      </div>
    )
  })

  CustomContent.propTypes = TypesNavTreePropTypes

  const CustomTreeItem = (props) => {
    return <TreeItem ContentComponent={CustomContent} {...props}/>
  }

  let i = 0

  return types.map((type) =>
    <CustomTreeItem
      key={type.name}
      nodeId={type.name}
      label={type.name}
      ContentProps={{
        hasHideIcon: true,
        typeName: type.name,
      }}
    >
      {type.elements && type.elements.length > 0 ?
    type.elements.map((e) => {
      const childKey = `${pathPrefix}-${i++}`
      return (
        <React.Fragment key={childKey}>
          <NavTree
            model={model}
            element={e}
            pathPrefix={pathPrefix}
            selectWithShiftClickEvents={selectWithShiftClickEvents}
          />
        </React.Fragment>
      )
    }) : null}
    </CustomTreeItem>)
}
