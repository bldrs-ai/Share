import React from 'react'
import {utils, writeFile} from 'xlsx'
import {TooltipIconButton} from './Buttons'
import useStore from '../store/useStore'
import LevelsIcon from '../assets/2D_Icons/Spreadsheet.svg'


/**
 * @return {Function} The button react component.
 */
export default function ExportSpreadsheet() {
  const viewer = useStore((state) => state.viewerStore)
  const model = useStore((state) => state.modelStore)
  // TODO(pablo): change name of rootElt to rootEltId
  const rootEltId = useStore((state) => state.rootElt)
  /** Initiate worksheet download. */
  async function handleClick() {
    if (viewer && rootEltId) {
      // const rootElt = await model.ifcManager.getSpatialStructure(0, true)
      console.log('model', model)
      const allOutputElts = []
      const typesMap = model.ifcManager.typesMap
      const typeIdsByEltIds = model.ifcManager.types.state.models[0].types
      if (typesMap === undefined || typeIdsByEltIds === undefined) {
        console.warn('Cannot enumerate elts by types', typesMap, typeIdsByEltIds)
        return
      }
      const outputEltsByTypeId = {}
      for (const eltId in typeIdsByEltIds) {
        if (Object.prototype.hasOwnProperty.call(typeIdsByEltIds, eltId)) {
          const typeId = typeIdsByEltIds[eltId]
          const props = await model.ifcManager.getItemProperties(0, parseInt(eltId), true)
          const propSets = await model.ifcManager.getPropertySets(0, parseInt(eltId), true)
          for (let i = 0; i < propSets.length; i++) {
            const pset = propSets[i]
            const psetName = pset.Name.value
            if (psetName && pset.HasProperties) {
              props[psetName] = pset.HasProperties
            } else {
              console.warn('Cannot unroll pset: ', pset)
            }
          }
          // props.psets = propSets
          const outputElt = jsonify(props)
          let eltsOfType = outputEltsByTypeId[typeId]
          if (eltsOfType === undefined) {
            eltsOfType = []
            outputEltsByTypeId[typeId] = eltsOfType
          }
          eltsOfType.push(outputElt)
          allOutputElts.push(outputElt)
        }
      }
      /*
      const csv = format(props, {
        omitNull: true,
        out: 'csv',
      })
      */
      const workbook = utils.book_new()
      for (const typeId in outputEltsByTypeId) {
        if (Object.prototype.hasOwnProperty.call(outputEltsByTypeId, typeId)) {
          const outputEltsOfType = outputEltsByTypeId[typeId]
          const typeName = typesMap[typeId]
          const eltsOfTypeWorksheet = utils.json_to_sheet(outputEltsOfType)
          utils.book_append_sheet(workbook, eltsOfTypeWorksheet, typeName)
        }
      }
      if (allOutputElts) {
        const worksheet = utils.json_to_sheet(allOutputElts)
        utils.book_append_sheet(workbook, worksheet, 'All Elements')
      }

      // xlsx handles triggering the download.
      //
      // Search for "XLSX.writeFile takes care of packaging the data
      // and attempting a local download" in
      // https://www.npmjs.com/package/xlsx
      writeFile(workbook, 'Report.xlsx')
    }
  }

  return (
    <TooltipIconButton
      title={'Export spreadsheet'}
      icon={<LevelsIcon/>}
      onClick={handleClick}
    />
  )
}


/**
 * @param {object} obj Object to be translated
 * @return {object} JSON-like object.
 */
function jsonify(obj) {
  const json = {}
  const MAX_CELL_LEN = 32767
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key]
      if (typeof value === 'object') {
        if (value === null) {
          continue
        }
        if (Array.isArray(value)) {
          // Array
          let str = JSON.stringify(value, null, '')
          if (str.length > MAX_CELL_LEN) {
            str = str.substring(0, MAX_CELL_LEN)
          }
          json[key] = str
        } else {
          // Object
          let str = JSON.stringify(value, null, '  ')
          if (str.length > MAX_CELL_LEN) {
            str = str.substring(0, MAX_CELL_LEN)
          }
          json[key] = str
        }
      } else {
        json[key] = value
      }
    }
  }
  return json
}
