import React from 'react';
import '../styles/tree.css';
import TreeItem, { useTreeItem } from '@mui/lab/TreeItem';
import PropTypes from 'prop-types';
import clsx from 'clsx';
import Typography from '@mui/material/Typography';


const prettyType = elt => {
  switch (elt.type) {
  case 'IFCBEAM': return 'Beam';
  case 'IFCBUILDING': return 'Building';
  case 'IFCBUILDINGSTOREY': return 'Storey';
  case 'IFCBUILDINGELEMENTPROXY': return 'Element (generic proxy)';
  case 'IFCCOLUMN': return 'Column';
  case 'IFCCOVERING': return 'Covering';
  case 'IFCDOOR': return 'Door';
  case 'IFCFLOWSEGMENT': return 'Flow Segment';
  case 'IFCFLOWTERMINAL': return 'Flow Terminal';
  case 'IFCPROJECT': return 'Project';
  case 'IFCRAILING': return 'Railing';
  case 'IFCROOF': return 'Roof';
  case 'IFCSITE': return 'Site';
  case 'IFCSLAB': return 'Slab';
  case 'IFCSPACE': return 'Space';
  case 'IFCWALL': return 'Wall';
  case 'IFCWALLSTANDARDCASE': return 'Wall (std. case)';
  case 'IFCWINDOW': return 'Window';
  default: return elt.type;
  }
};


const NavTree = ({
  viewer,
  element,
  onElementSelect,
  keyPrefix = ''
}) => {

  const CustomContent = React.forwardRef(function CustomContent(props, ref) {
    const {
      classes,
      className,
      label,
      nodeId,
      icon: iconProp,
      expansionIcon,
      displayIcon,
    } = props;

    const {
      disabled,
      expanded,
      selected,
      focused,
      handleExpansion,
      handleSelection,
      preventSelection,
    } = useTreeItem(nodeId);

    const icon = iconProp || expansionIcon || displayIcon;

    const handleMouseDown = event => {
      preventSelection(event);
    };

    const handleExpansionClick = event => {
      handleExpansion(event);
    };

    const handleSelectionClick = event => {
      handleSelection(event);
      onElementSelect(element);
    };

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
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events,jsx-a11y/no-static-element-interactions */}
        <div onClick={handleExpansionClick} className={classes.iconContainer}>
          {icon}
        </div>
        <Typography
          onClick={handleSelectionClick}
          component="div"
          className={classes.label}
        >
          {label}
        </Typography>
      </div>
    );
  });


  CustomContent.propTypes = {
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
  };


  const CustomTreeItem = (props) => (
    <TreeItem ContentComponent={CustomContent} {...props} />
  );


  let i = 0;
  // TODO(pablo): Had to add this React.Fragment wrapper to get rid of
  // warning about missing a unique key foreach item.  Don't really understand it.
  return (
    <CustomTreeItem nodeId={keyPrefix} label={element.Name ? element.Name.value : prettyType(element)}
                    onClick = {() => onElementSelect(element)}>
      {
        element.children && element.children.length > 0 ? element.children.map(
          child => {
            const childKey = `${keyPrefix}-${i++}`;
            return (<React.Fragment key={childKey}>
                      <NavTree
                        viewer = {viewer}
                        element = {child}
                        onElementSelect = {onElementSelect}
                        keyPrefix = {childKey} />
                    </React.Fragment>);
          }
        )
          : null
      }
    </CustomTreeItem>
  );
};

export default NavTree;
