import React, {ReactElement, RefObject, forwardRef, useRef} from 'react'
import TreeItem from '@mui/lab/TreeItem'
import {assertDefined} from '../../utils/assert'
import CustomContent from './CustomContent'
import NavTree from './NavTree'
import PropTypes from './PropTypes'


/**
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
  idToRef,
}) {
  assertDefined(keyId, model, types, pathPrefix, selectWithShiftClickEvents, idToRef)
  const customContentRef = forwardRef(CustomContent)
  customContentRef.propTypes = PropTypes

  const CustomTreeItem = (props) => {
    return <TreeItem ContentComponent={customContentRef} {...props}/>
  }

  // TODO(pablo): total hack to support scrollIntoView behavior.  See
  // NavTreePanel#useEffect[selectedElts] for use.
  const itemRef = useRef(null)
  const itemId = `type-root`

  let i = 0
  return types.map((type) =>
    <CustomTreeItem
      key={keyId}
      nodeId={itemId}
      label={type.name}
      ContentProps={{
        isExpandable: true,
      }}
      data-testid={keyId}
    >
      <div ref={itemRef}/>
      {type.elements && type.elements.length > 0 ?
       type.elements.map((e) => {
         const childKeyId = `${pathPrefix}-${i++}`
         return (
           <NavTree
             key={childKeyId}
             keyId={childKeyId}
             model={model}
             element={e}
             pathPrefix={pathPrefix}
             selectWithShiftClickEvents={selectWithShiftClickEvents}
             idToRef={idToRef}
           />
         )
       }) : null
      }
    </CustomTreeItem>)
}
