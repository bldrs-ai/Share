import React, {ReactElement, RefObject, forwardRef} from 'react'
import {reifyName} from '@bldrs-ai/ifclib'
import TreeItem from '@mui/lab/TreeItem'
import useStore from '../../store/useStore'
import {assertDefined} from '../../utils/assert'
import CustomContent from './CustomContent'
import PropTypes from './PropTypes'


/**
 * @property {object} model IFC model
 * @property {object} element Element in the model
 * @property {string} pathPrefix URL prefix for constructing links to
 *   elements, recursively grown as passed down the tree
 * @property {Function} selectWithShiftClickEvents handler for shift-clicks
 * @property {Map<string,RefObject<HTMLDivElement>>} idToRef Mapping of expressId to TreeItem refs
 * @return {ReactElement}
 */
export default function NavTree({
  keyId,
  model,
  element,
  pathPrefix,
  selectWithShiftClickEvents,
  idToRef,
}) {
  assertDefined(keyId, model, pathPrefix, selectWithShiftClickEvents, idToRef)

  const customContentRef = forwardRef(CustomContent)
  customContentRef.propTypes = PropTypes
  const CustomTreeItem = (props) => <TreeItem ContentComponent={customContentRef} {...props}/>

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
        idToRef: idToRef,
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
              idToRef={idToRef}
            />
          )
        }) :
        null}
    </CustomTreeItem>
  )
}
