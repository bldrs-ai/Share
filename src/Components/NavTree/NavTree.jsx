import React, {ReactElement, RefObject, forwardRef, useRef} from 'react'
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

  const viewer = useStore((state) => state.viewer)
  const hasHideIcon = viewer.isolator.canBeHidden(element.expressID)

  // TODO(pablo): total hack to support scrollIntoView behavior.  See
  // NavTreePanel#useEffect[selectedElts] for use.
  const itemRef = useRef(null)
  const nodeId = element.expressID.toString()
  idToRef[nodeId] = itemRef

  let i = 0

  return (
    <CustomTreeItem
      key={keyId}
      nodeId={nodeId}
      label={reifyName({properties: model}, element)}
      ContentProps={{
        hasHideIcon: hasHideIcon,
        isExpandable: element.children && element.children.length > 0,
      }}
      data-testid={keyId}
    >
      <div ref={itemRef}/>
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
