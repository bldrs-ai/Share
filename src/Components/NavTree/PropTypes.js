// PropTypes.js
import PropTypes from 'prop-types'


export const navTreeItemPropTypes = {
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
   * Determines if the tree node has a hide icon.
   */
  isExpandable: PropTypes.bool.isRequired,
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
   * Multi-select callback
   */
  selectWithShiftClickEvents: PropTypes.func.isRequired,
  /**
   * Map of nodeId to ref
   */
  idToRef: PropTypes.object,
  /**
   * Expand/Collapse toggle handler
   */
  onIconClick: PropTypes.func,
  /**
   * Node click handler
   */
  onClick: PropTypes.func,
  /**
   * Depth of the node in the tree
   */
  nodeDepth: PropTypes.number,
  /**
   * Selection state
   */
  isSelected: PropTypes.bool,
}

