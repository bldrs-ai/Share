import React from 'react';
import '../styles/tree.css';
import TreeItem, { useTreeItem } from '@mui/lab/TreeItem';
import PropTypes from 'prop-types';
import clsx from 'clsx';
import Typography from '@mui/material/Typography';


const NavTree = ({
  viewer,
  element,
  onElementSelect,
  keyPrefix = ''
}) => {

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


  // Most of below comes from the Mui demo for custom ContentComponent
  // prop for "... limiting expansion to clicking the icon"
  // https://mui.com/components/tree-view/#IconExpansionTreeView.js
  const [elementText, setElementText] = React.useState('');

  React.useEffect(() => {
    // TODO(pablo): copypasta to fix
    // "Can't perform a React state update on an unmounted component"
    // The idea here is that the async handler was being called
    // multiple times, including after unmounted.  Needed to add a
    // state var and cleanup return function. But I don't really
    // understand lifecycle.
    //
    // This looks informative:
    // https://overreacted.io/a-complete-guide-to-useeffect/#so-what-about-cleanup
    let mounted = true;
    viewer.getProperties(0, element.expressID).then(props => {
      if (mounted) {
        // TODO: e.g. when there's no model loaded.
        if (props === null) {
          return 'model not loaded';
        }
        setElementText((props.Name ? props.Name.value : null) || prettyType(element));
      }
    });
    return () => {
      mounted = false;
    };
  }, [viewer, element, elementText]);


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
    <CustomTreeItem nodeId={keyPrefix} label={elementText}
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
