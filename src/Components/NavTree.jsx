import React, {useEffect, useState} from 'react'
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome'
import {faEye, faEyeSlash, faGlasses} from '@fortawesome/free-solid-svg-icons'
import clsx from 'clsx'
import PropTypes from 'prop-types'
import {useNavigate} from 'react-router-dom'
import {reifyName} from '@bldrs-ai/ifclib'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import TreeItem, {useTreeItem} from '@mui/lab/TreeItem'
import {computeElementPathIds} from '../utils/TreeUtils'
import {handleBeforeUnload} from '../utils/event'
import useStore from '../store/useStore'
import IfcIsolator from '../Infrastructure/IfcIsolator'


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
 * @param {IfcIsolator} The IFC isoaltor
 * @param {number} IFC element id
 * @return {object} React component
 */
function HideIcon({isolator, elementId}) {
  const [isHidden, setIsHidden] = useState(false)
  const [isIsolated, setIsIsolated] = useState(false)
  const [isDisabled, setIsDisabled] = useState(false)
  const hiddenElements = useStore((state) => state.hiddenElements)
  const isTempIsolationModeOn = useStore((state) => state.isTempIsolationModeOn)
  const isolatedElements = useStore((state) => state.isolatedElements)
  const [id] = useState(elementId)

  useEffect(() => {
    setIsHidden(hiddenElements.includes(id))
  }, [hiddenElements, id])

  useEffect(() => {
    setIsIsolated(isolatedElements.includes(id))
  }, [isolatedElements, id])

  useEffect(() => {
    setIsDisabled(isTempIsolationModeOn)
  }, [isTempIsolationModeOn])

  const toggleHide = () => {
    if (!isHidden) {
      setIsHidden(true)
      isolator.hideElementsById(id)
    } else {
      setIsHidden(false)
      isolator.unHideElementsById(id)
    }
  }

  const iconStyle = {float: 'right', margin: '4px'}
  if (isDisabled && !isIsolated) {
    iconStyle.opacity = 0.3
  }
  const icon = isIsolated ? faGlasses : (!isHidden ? faEye : faEyeSlash)

  return <FontAwesomeIcon disabled={isDisabled} style={iconStyle} onClick={toggleHide} icon={icon}/>
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

    const viewer = useStore((state) => state.viewer)

    const hiddenElements = useStore((state) => state.hiddenElements)

    const handleSelectionClick = (event) => {
      handleSelection(event)
      setSelectedElement(element)
    }

    const navigate = useNavigate()

    useEffect(() => {
      if (selectedElement) {
        if (hiddenElements.includes(selectedElement.expressID)) {
          return
        }
        const newPath =
              `${pathPrefix}/${computeElementPathIds(element, (elt) => elt.expressID).join('/')}`
        window.removeEventListener('beforeunload', handleBeforeUnload)
        navigate(newPath)
      }
    }, [selectedElement, navigate, hiddenElements])

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
          {viewer.isolator.canBeHidden(element.expressID) &&
            <div style={{display: 'contents'}}>
              <HideIcon isolator={viewer.isolator} elementId={element.expressID}/>
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
