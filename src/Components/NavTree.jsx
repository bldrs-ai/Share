import React from 'react'
import {Link as RouterLink} from 'react-router-dom'
import TreeItem, {useTreeItem} from '@mui/lab/TreeItem'
import PropTypes from 'prop-types'
import clsx from 'clsx'
import Typography from '@mui/material/Typography'
import {reifyName} from '../utils/Ifc'
import {computeElementPath} from '../utils/TreeUtils'


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
}


/**
 * @param {Object} model IFC model
 * @param {Object} element IFC element of the model
 * @param {string} pathPrefix URL prefix for constructing links to
 *   elements, recursively grown as passed down the tree
 * @param {string} onElementSelect Callback when tree item element is selected
 * @param {string} setExpandedElements React state setter to update items to expand in tree
 * @return {Object} React component
 */
export default function NavTree({
  model,
  element,
  pathPrefix,
  onElementSelect,
  setExpandedElements,
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

    const handleMouseDown = (event) => {
      preventSelection(event)
    }

    const handleExpansionClick = (event) => {
      handleExpansion(event)
    }

    const handleSelectionClick = (event) => {
      handleSelection(event)
      onElementSelect(element)
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
        ref={ref}>
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events,
            jsx-a11y/no-static-element-interactions */}
        <div onClick={handleExpansionClick} style={{marginLeft: 10}}>
          {icon}
        </div>
        <Typography onClick={handleSelectionClick} >
          <RouterLink
            to={
              pathPrefix +
              computeElementPath(element, (elt) => elt.expressID.toString())
            }
            style={{
              textDecoration: 'none',
              fontFamily: 'helvetica',
              fontWeight: 200,
              color: '#696969',
              marginLeft: 8,
            }}
          >
            {label}
          </RouterLink>
        </Typography>
      </div>
    )
  })

  CustomContent.propTypes = NavTreePropTypes

  const CustomTreeItem = (props) => {
    return <TreeItem ContentComponent={CustomContent} {...props} />
  }

  let i = 0
  // TODO(pablo): Had to add this React.Fragment wrapper to get rid of
  // warning about missing a unique key foreach item.  Don't really understand it.
  return (
    <CustomTreeItem
      nodeId={element.expressID.toString()}
      label={reifyName(model, element)}
      onClick={() => onElementSelect(element)}>
      {element.children && element.children.length > 0 ?
        element.children.map((child) => {
          const childKey = `${pathPrefix}-${i++}`
          return (
            <React.Fragment key={childKey}>
              <NavTree
                model={model}
                element={child}
                pathPrefix={pathPrefix}
                onElementSelect={onElementSelect}
                setExpandedElements={setExpandedElements}
              />
            </React.Fragment>
          )
        }) :
        null}
    </CustomTreeItem>
  )
}
