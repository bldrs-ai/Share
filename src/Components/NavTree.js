import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import TreeItem, { useTreeItem } from '@mui/lab/TreeItem';
import PropTypes from 'prop-types';
import clsx from 'clsx';
import Typography from '@mui/material/Typography';
import Link from '@mui/material/Link';
import {reifyName} from '../utils/Ifc';


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
};


const NavTree = ({
  viewer,
  element,
  path,
  onElementSelect,
  setExpandedElements,
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

    const child = props.child;

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
          className={classes.label}>
          <RouterLink to={path}
                      style={{color: 'black', textDecoration: 'none'}}>
            {label}
          </RouterLink>
        </Typography>
      </div>
    );
  });


  CustomContent.propTypes = NavTreePropTypes;


  const CustomTreeItem = (props) => {
    return <TreeItem ContentComponent={CustomContent} {...props}/>
  };

  const ChildTreeItem = (props) => {
    return <TreeItem ContentProps={{child: props.child}} ContentComponent={CustomContent} {...props}/>
  };

  const nodeId = element.expressID.toString();
  let i = 0;
  // TODO(pablo): Had to add this React.Fragment wrapper to get rid of
  // warning about missing a unique key foreach item.  Don't really understand it.
  return (
    <CustomTreeItem
      nodeId={element.expressID.toString()}
      label={reifyName(element, viewer)}
      onClick={() => onElementSelect(element)}>
      {
        element.children && element.children.length > 0 ? element.children.map(
          child => {
            const childKey = `${keyPrefix}-${i++}`;
            return <React.Fragment key={childKey}>
                     <NavTree
                       viewer={viewer}
                       element={child}
                       path={path + '/' + child.expressID}
                       onElementSelect={onElementSelect}
                       setExpandedElements={setExpandedElements}
                       keyPrefix={childKey} />
                   </React.Fragment>
          }) : null
      }
    </CustomTreeItem>);
};

export default NavTree;
