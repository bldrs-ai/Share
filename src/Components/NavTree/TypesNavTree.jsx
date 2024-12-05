import React, {ReactElement, RefObject, forwardRef} from 'react'
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
 * @property {object} types Types to use in the model
 * @property {string} pathPrefix URL prefix for constructing links to
 *   elements, recursively grown as passed down the tree
 * @property {Function} selectWithShiftClickEvents handler for shift-clicks
 * @property {Map<string,RefObject<HTMLDivElement>>} idToRef Mapping of expressId to TreeItem refs
 * @return {ReactElement}
 */
export default function TypesNavTree({
  keyId,
  model,
  types,
  pathPrefix,
  selectWithShiftClickEvents,
}) {
  assertDefined(keyId, model, types, pathPrefix, selectWithShiftClickEvents)

  const viewer = useStore((state) => state.viewer)

  const navTreeItemRef = forwardRef(NavTreeItem)
  navTreeItemRef.propTypes = PropTypes

  const CustomTreeItem = (props) => <TreeItem ContentComponent={navTreeItemRef} {...props}/>

  let i = 0
  return types.map((type) =>
    <CustomTreeItem
      key={`${keyId}-${i++}`}
      nodeId={type.name}
      label={type.name}
      ContentProps={{
        isExpandable: true,
        selectWithShiftClickEvents: selectWithShiftClickEvents,
      }}
      data-testid={keyId}
    >
      {
        type.elements && type.elements.length > 0 ?
          type.elements.map((elt) => {
            const childKeyId = `${pathPrefix}-${i++}`
            const hasHideIcon = viewer.isolator.canBeHidden(elt.expressID)
            return (
              <CustomTreeItem
                key={childKeyId}
                nodeId={elt.expressID.toString()}
                label={reifyName({properties: model}, elt)}
                ContentProps={{
                  hasHideIcon: hasHideIcon,
                  isExpandable: false,
                  selectWithShiftClickEvents: selectWithShiftClickEvents,
                }}
              />
            )
          }) :
          null
      }
    </CustomTreeItem>)
}
