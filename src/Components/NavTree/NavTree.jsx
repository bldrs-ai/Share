import React, {ReactElement, forwardRef} from 'react'
import {reifyName} from '@bldrs-ai/ifclib'
import TreeItem from '@mui/lab/TreeItem'
import useStore from '../../store/useStore'
import {assertDefined} from '../../utils/assert'
import NavTreeItem from './NavTreeItem'
import PropTypes from './PropTypes'


/**
 * @property {string} keyId Unique key
 * @property {object} model IFC model
 * @property {object} element Element in the model
 * @property {string} pathPrefix URL prefix for constructing links to
 *   elements, recursively grown as passed down the tree
 * @property {Function} selectWithShiftClickEvents handler for shift-clicks
 * @return {ReactElement}
 */
export default function NavTree({
  keyId,
  model,
  element,
  pathPrefix,
  selectWithShiftClickEvents,
}) {
  assertDefined(keyId, model, pathPrefix, selectWithShiftClickEvents)

  const navTreeItemRef = forwardRef(NavTreeItem)
  navTreeItemRef.propTypes = PropTypes
  const CustomTreeItem = (props) => <TreeItem ContentComponent={navTreeItemRef} {...props}/>

  const isExpandable = element.children && element.children.length > 0
  const viewer = useStore((state) => state.viewer)
  const hasHideIcon = viewer.isolator.canBeHidden(element.expressID)

  let i = 0
  return (
    <CustomTreeItem
      key={keyId}
      nodeId={element.expressID.toString()}
      label={reifyName({properties: model}, element)}
      ContentProps={{
        hasHideIcon: hasHideIcon,
        isExpandable: isExpandable,
        selectWithShiftClickEvents: selectWithShiftClickEvents,
      }}
      data-testid={keyId}
    >
      {element.children && element.children.length > 0 ?
        element.children.map((child) => {
          const childKeyId = `${pathPrefix}-${i++}`
          return (
            <NavTree
              key={childKeyId}
              keyId={childKeyId}
              model={model}
              element={child}
              pathPrefix={pathPrefix}
              selectWithShiftClickEvents={selectWithShiftClickEvents}
            />
          )
        }) :
        null}
    </CustomTreeItem>
  )
}
