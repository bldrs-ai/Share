import React from 'react'
import PropTypes from 'prop-types'
import HideToggleButton from '../HideToggleButton'
import NodeClosedIcon from '../../assets/icons/NodeClosed.svg'
import NodeOpenIcon from '../../assets/icons/NodeOpened.svg'
import {reifyName} from '@bldrs-ai/ifclib'


const NavTreeNode = ({
  node,
  depth,
  isExpanded,
  isSelected,
  hasChildren,
  handleToggle,
  handleSelect,
  hasHideIcon,
  model,
  theme,
  style,
  isNavTree,
}) => {
  const handleLabelClick = (event) => {
    handleSelect(event)
  }

  const handleExpandClick = (event) => {
    event.stopPropagation()
    handleToggle(event)
  }

  const handleHideClick = (event) => {
    event.stopPropagation()
    // The HideToggleButton handles the hide/show logic internally
  }

  // Determine the label based on whether it's a type node or an element node
  const label = node.label || reifyName({properties: model}, node)
  const paddingLeft = 20 // Indentation for each tree depth

  return (
    <div
      style={{
        ...style,
        paddingLeft: depth * paddingLeft,
        display: 'flex',
        alignItems: 'flex-start', // Align items at the top for multiline labels
        backgroundColor: isSelected ? theme.palette.action.selected : 'transparent',
        cursor: 'pointer',
      }}
    >
      {/* Expand/Collapse Icon */}
      {hasChildren ? (
        <div
          onClick={handleExpandClick}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              handleExpandClick(event)
            }
          }}
          role="button"
          tabIndex={0}
          style={{
            marginRight: 8,
            marginTop: 4, // Align the icon with the text
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {isExpanded ? (
            <NodeOpenIcon className="icon-share icon-nav-caret"/>
          ) : (
            <NodeClosedIcon className="icon-share icon-nav-caret"/>
          )}
        </div>
      ) : (
        <div style={{width: 24, marginRight: 8}}/>
      )}

      {/* Label */}
      <div
        id="NavTreeNodeLabelId"
        onClick={handleLabelClick}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            handleLabelClick(event)
          }
        }}
        role="button"
        tabIndex={0}
        style={{
          flexGrow: 1,
          wordBreak: 'break-word', // Allow breaking long words
          whiteSpace: 'normal', // Enable multiline wrapping
          overflow: 'visible', // Ensure full rendering of the content
        }}
      >
        {label}
      </div>

      {/* Hide Icon */}
      {hasHideIcon && (
        <div
          style={{
            marginLeft: 'auto',
            paddingRight: 16,
            marginTop: 4, // Align the icon with the text
            display: 'flex',
            alignItems: 'center',
          }}
          onClick={handleHideClick}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              handleHideClick(event)
            }
          }}
          role="button"
          tabIndex={0}
        >
          <HideToggleButton elementId={parseInt(node.expressID, 10)}/>
        </div>
      )}
    </div>
  )
}

NavTreeNode.propTypes = {
  node: PropTypes.object.isRequired,
  depth: PropTypes.number.isRequired,
  isExpanded: PropTypes.bool.isRequired,
  isSelected: PropTypes.bool.isRequired,
  hasChildren: PropTypes.bool.isRequired,
  handleToggle: PropTypes.func.isRequired,
  handleSelect: PropTypes.func.isRequired,
  hasHideIcon: PropTypes.bool.isRequired,
  model: PropTypes.object.isRequired,
  theme: PropTypes.object.isRequired,
  style: PropTypes.object.isRequired,
  isNavTree: PropTypes.bool.isRequired, // Added isNavTree to propTypes
}

export default NavTreeNode
