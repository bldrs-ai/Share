import React, {useEffect} from 'react'
import Box from '@mui/material/Box'
import debug from '../utils/debug'

// New
import {Color} from 'three'
import * as OBC from 'openbim-components'
import {OBJLoader} from 'three/examples/jsm/loaders/OBJLoader.js'


/** @return {React.Component} The Viewer component. */
export default function Viewer({installPrefix, appPrefix, pathPrefix, modelPath}) {
  debug().log('Viewer paths', {installPrefix, appPrefix, pathPrefix, modelPath})
  useEffect(() => {
    (async () => {
      // Set up scene (see SimpleScene tutorial)
      const container = document.getElementById('viewer-container')

      const components = new OBC.Components()
      components.scene = new OBC.SimpleScene(components)
      const renderer = new OBC.PostproductionRenderer(components, container)
      components.renderer = renderer
      components.camera = new OBC.SimpleCamera(components)
      components.raycaster = new OBC.SimpleRaycaster(components)
      components.init()

      // Looks smoother with this enabled, but gobbles GPU.
      renderer.postproduction.enabled = false

      // Step back 10 meters
      const r = 10
      components.camera.controls.setLookAt(r, r, r, 0, 0, 0)
      components.scene.setup()

      const scene = components.scene.get()

      // Grid
      const grid = new OBC.SimpleGrid(components, new Color('grey'))
      components.tools.add('grid', grid)
      const gridMesh = grid.get()
      renderer.postproduction.customEffects.excludedMeshes.push(gridMesh)


      // Check for pre-processed fragment format
      /*
      const fragments = new OBC.FragmentManager(components)
      const file = await fetch('/resources/small.frag')
      const dataBlob = await file.arrayBuffer()
      const buffer = new Uint8Array(dataBlob)
      const model = await fragments.load(buffer)
      const properties = await fetch('/resources/small.json')
      model.properties = await properties.json()
      */

      /*
        For editing properties:
        IfcPropertiesManager is designed as an extension of the
        IfcPropertiesProcessor.
      */
      const propsProcessor = new OBC.IfcPropertiesProcessor(components)
      const propsManager = new OBC.IfcPropertiesManager(components)
      propsProcessor.propertiesManager = propsManager

      // TODO(pablo): Patching the new methods added to web-ifc since
      // Conway's snapshot at 0.0.34 to 0.0.44, which is what
      // components expects.
      const ifcApi = propsManager._ifcApi
      ifcApi.constructor.prototype.GetHeaderLine = function() {
        // undefined triggers bypass
      }
      ifcApi.constructor.prototype.GetModelSchema = function(ndx) {
        return '' // triggers default in caller of IFC2X3
      }
      // const SMALL_IFC_MAX_ID = 25133
      const INDEX_IFC_MAX_ID = 771
      ifcApi.constructor.prototype.GetMaxExpressID = function(ndx) {
        // HACK(pablo): need a better stub
        // return 25133 // small.ifc
        return INDEX_IFC_MAX_ID // index.ifc
      }

      propsManager.wasm = {
        // path: 'https://unpkg.com/web-ifc@0.0.44/',
        path: '/static/js/',
        absolute: true,
      }

      /*
      propsManager.onRequestFile.add(async () => {
        const fetched = await fetch('/resources/small.ifc')
        propsManager.ifcToExport = await fetched.arrayBuffer()
      })
      */

      const fragments = new OBC.FragmentManager(components)
      const fragmentIfcLoader = new OBC.FragmentIfcLoader(components)

      /**
       * @param {string} loadPath
       * @return {object} The IFC model
       */
      async function loadIfcAsFragments(loadPath) {
        /*
        const excludedCats = [
          WEBIFC.IFCTENDONANCHOR,
          WEBIFC.IFCREINFORCINGBAR,
          WEBIFC.IFCREINFORCINGELEMENT,
        ]

        for (const cat of excludedCats) {
          fragmentIfcLoader.settings.excludedCategories.add(cat)
        }
        */
        fragmentIfcLoader.settings.webIfc.COORDINATE_TO_ORIGIN = true
        fragmentIfcLoader.settings.webIfc.OPTIMIZE_PROFILES = true

        const response = await fetch(loadPath)
        // TODO(pablo): test response
        const responseBuf = await response.arrayBuffer()
        const modelSource = new Uint8Array(responseBuf)
        // Why is this Uint8 and not UTF-8?
        const model = await fragmentIfcLoader.load(modelSource)
        return model
      }


      /**
       * @param {string} loadPath
       * @return {object} The OBJ model
       */
      async function loadObj(loadPath) {
        const objLoader = new OBJLoader
        const response = await fetch(loadPath)
        // TODO(pablo): test response
        const modelSource = await response.text()
        const model = objLoader.parse(modelSource)
        return model
      }


      let model
      if (modelPath.filepath.endsWith('ifc')) {
        model = await loadIfcAsFragments(modelPath.filepath)
        await propsManager.init()
        propsProcessor.process(model)
      } else if (modelPath.filepath.endsWith('obj')) {
        // NOTE: to use, add 'obj' to list of supported extensions in ../Filetypes.js
        model = await loadObj(modelPath.filepath)
        // TODO(pablo): obj props
      }
      scene.add(model)


      const highlighter = new OBC.FragmentHighlighter(components, fragments)
      highlighter.setup()
      components.renderer.postproduction.customEffects.outlineEnabled = true
      highlighter.outlinesEnabled = true

      const highlighterEvents = highlighter.events
      highlighterEvents.select.onClear.add(() => {
        propsProcessor.cleanPropertiesList()
      })


      // Item selection and properties display
      highlighterEvents.select.onHighlight.add(
          (selection) => {
            const fragmentID = Object.keys(selection)[0]
            const expressID = Number([...selection[fragmentID]][0])
            let frag
            for (const group of fragments.groups) {
              const fragmentFound = Object.values(group.keyFragments).find((id) => id === fragmentID)
              if (fragmentFound) {
                frag = group
              }
            }
            propsProcessor.renderProperties(frag, expressID)
          })

      /*
        Finally, we will add the UI to the app by creating a simple
        toolbar:
      */
      const mainToolbar = new OBC.Toolbar(components)
      components.ui.addToolbar(mainToolbar)
      mainToolbar.addChild(propsProcessor.uiElement.get('main'))
    })()
  }, [modelPath.filepath])


  return (
    <>
      <Box
        sx={{
          position: 'absolute',
          top: '0px',
          left: '0px',
          textAlign: 'center',
          width: '100vw',
          height: '100vh',
          margin: 'auto',
          zIndex: -1000,
        }}
        id='viewer-container'
      >
        Viewer
      </Box>
    </>
  )
}
