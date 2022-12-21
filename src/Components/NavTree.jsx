import React, {useEffect, useState} from 'react'
import clsx from 'clsx'
import PropTypes from 'prop-types'
import {useNavigate} from 'react-router-dom'
import {reifyName} from '@bldrs-ai/ifclib'
import Box from '@mui/material/Box'
import TreeItem, {useTreeItem} from '@mui/lab/TreeItem'
import Typography from '@mui/material/Typography'
import {computeElementPathIds} from '../utils/TreeUtils'


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

    const handleMouseDown = (event) => preventSelection(event)

    const handleExpansionClick = (event) => handleExpansion(event)

    const [selectedElement, setSelectedElement] = useState(null)

    const handleSelectionClick = (event) => {
      handleSelection(event)
      setSelectedElement(element)
    }

    const navigate = useNavigate()

    useEffect(() => {
      if (selectedElement) {
        const newPath =
              `${pathPrefix}/${computeElementPathIds(element, (elt) => elt.expressID).join('/')}`
        navigate(newPath)
      }
    }, [selectedElement, navigate])

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
        <Typography
          variant='tree'
          onClick={handleSelectionClick}
        >
          {label}
        </Typography>
      </div>
    )
  })

  CustomContent.propTypes = NavTreePropTypes

  const CustomTreeItem = (props) => {
    return <TreeItem ContentComponent={CustomContent} {...props}/>
  }

  let i = 0
  // TODO(pablo): Had to add this React.Fragment wrapper to get rid of
  // warning about missing a unique key foreach item.  Don't really understand it.
  return (
    <CustomTreeItem
      nodeId={element.expressID.toString()}
      label={reifyName({properties: model}, element)}
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
              />
            </React.Fragment>
          )
        }) :
        null}
    </CustomTreeItem>
  )
}
