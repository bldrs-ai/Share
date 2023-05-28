import React, {useEffect, useMemo, useRef} from 'react'
import {useNavigate, useParams} from 'react-router-dom'
import CssBaseline from '@mui/material/CssBaseline'
import {ThemeProvider} from '@mui/material/styles'
import Styles from './Styles'
import {CAMERA_PREFIX} from './Components/CameraControl'
import CadView, {searchIndex} from './Containers/CadView'
import WidgetApi from './WidgetApi/WidgetApi'
import useStore from './store/useStore'
import useShareTheme from './theme/Theme'
import debug from './utils/debug'
import {navWith} from './utils/navigate'
import {handleBeforeUnload} from './utils/event'


/**
 * Handles path demuxing to pass to CadView.
 *
 * @param {string} installPrefix e.g. '' on bldrs.ai or /Share on GitHub pages.
 * @param {string} appPrefix e.g. /share is the prefix for this component.
 * @param {string} pathPrefix e.g. v/p for CadView, currently the only child.
 * @return {React.Component} The Share react component.
 */
export default function Share({installPrefix, appPrefix, pathPrefix}) {
  const navigation = useRef(useNavigate())
  const urlParams = useParams()
  const setRepository = useStore((state) => state.setRepository)
  const modelPath = useStore((state) => state.modelPath)
  const setModelPath = useStore((state) => state.setModelPath)

  useMemo(() => {
    new WidgetApi(navigation.current, searchIndex)
  }, [navigation])

  /**
   * On a change to urlParams, setting a new model path will clear the
   * scene and load the new model IFC.  If there's not a valid IFC,
   * the helper will redirect to the index file.
   *
   * Otherwise, the param change is a sub-path, e.g. the IFC element
   * path, so no other useEffect is triggered.
   */
  useEffect(() => {
    /** A demux to help forward to the index file, load a new model or do nothing. */
    const onChangeUrlParams = (() => {
      const mp = getModelPath(installPrefix, pathPrefix, urlParams)
      if (mp === null) {
        navToDefault(navigation.current, appPrefix)
        return
      }
      if (modelPath === null ||
          (modelPath.filepath && modelPath.filepath !== mp.filepath) ||
          (modelPath.gitpath && modelPath.gitpath !== mp.gitpath)) {
        setModelPath(mp)
        debug().log('Share#onChangeUrlParams: new model path: ', mp)
      }
    })
    onChangeUrlParams()

    // TODO(pablo): currently expect these to both be defined.
    const {org, repo} = urlParams
    if (org && repo) {
      setRepository(org, repo)
    } else if (pathPrefix.startsWith('/share/v/p')) {
      debug().log('Setting default repo pablo-mayrgundter/Share')
      setRepository('pablo-mayrgundter', 'Share')
    } else {
      debug().warn('No repository set for project!, ', pathPrefix)
    }
  }, [appPrefix, installPrefix, modelPath, pathPrefix, setRepository, urlParams, setModelPath])


  const theme = useShareTheme()
  // https://mui.com/material-ui/customization/how-to-customize/#4-global-css-override
  return (
    modelPath &&
      <CssBaseline enableColorScheme>
        <ThemeProvider theme={theme}>
          <Styles theme={theme}/>
          <CadView
            installPrefix={installPrefix}
            appPrefix={appPrefix}
            pathPrefix={pathPrefix}
            modelPath={modelPath}
          />
        </ThemeProvider>
      </CssBaseline>)
}


/**
 * Navigate to index.ifc with nice camera setting.
 *
 * @param {Function} navigate
 * @param {string} appPrefix
 */
export function navToDefault(navigate, appPrefix) {
  // TODO: probe for index.ifc
  const mediaSizeTabletWith = 900
  window.removeEventListener('beforeunload', handleBeforeUnload)
  const defaultPath = `${appPrefix}/v/p/index.ifc${location.query || ''}`
  const cameraHash = window.innerWidth < mediaSizeTabletWith ?
        `#${CAMERA_PREFIX}:-182.713,-124.929,216.121,-29.279,9.741,-3.702` :
        `#${CAMERA_PREFIX}:-119.076,0.202,83.165,-44.967,19.4,-4.972`
  navWith(navigate, defaultPath, {
    search: location.search,
    hash: cameraHash,
  })
}


/**
 * Navigate to index.ifc with nice camera setting.
 *
 * @param {Function} navigate
 * @param {string} appPrefix
 */
export function navigateToRandomSampleModel(navigate) {
  // eslint-disable-next-line no-magic-numbers
  const randomModel = Math.floor(Math.random() * (6))
  const modelPath = {
    0: '/share/v/gh/IFCjs/test-ifc-files/main/Schependomlaan/IFC%20Schependomlaan.ifc#c:60.45,-4.32,60.59,1.17,5.93,-3.77',
    1: '/share/v/gh/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc#c:-38.64,12.52,35.4,-5.29,0.94,0.86',
    2: '/share/v/gh/Swiss-Property-AG/Schneestock-Public/main/ZGRAGGEN.ifc#c:80.66,11.66,-94.06,6.32,2.93,-8.72',
    3: '/share/v/gh/Swiss-Property-AG/Eisvogel-Public/main/EISVOGEL.ifc#c:107.36,8.46,156.67,3.52,2.03,16.71',
    4: '/share/v/gh/Swiss-Property-AG/Seestrasse-Public/main/SEESTRASSE.ifc#c:119.61,50.37,73.68,16.18,11.25,5.74',
    // eslint-disable-next-line max-len
    5: '/share/v/gh/sujal23ks/BCF/main/packages/fileimport-service/ifc/ifcs/171210AISC_Sculpture_brep.ifc/120010/120020/120023/4998/2867#c:-163.46,16.12,223.99,12.03,-28.04,-15.28',
    6: '/share/v/gh/OlegMoshkovich/Bldrs_Plaza/main/IFC_STUDY.ifc',
  }
  // window.removeEventListener('beforeunload', handleBeforeUnload)
  navigate({pathname: modelPath[randomModel]})
}


/**
 * Returns a reference to an IFC model file.  For use by IfcViewerAPIExtended.load.
 *
 * Format is either a reference within this project's serving directory:
 *   {filepath: '/file.ifc'}
 *
 * or a global GitHub path:
 *   {gitpath: 'http://host/share/v/gh/bldrs-ai/Share/main/index.ifc'}
 *
 * @param {string} installPrefix e.g. /share
 * @param {string} pathPrefix e.g. /share/v/p
 * @param {object} urlParams e.g. .../:org/:repo/:branch/*
 * @return {object}
 */
export function getModelPath(installPrefix, pathPrefix, urlParams) {
  // TODO: combine modelPath methods into class.
  let m = null
  let filepath = urlParams['*']
  if (filepath === '') {
    return null
  }
  const splitRegex = /\.ifc/i
  const match = splitRegex.exec(filepath)
  if (!match) {
    throw new Error('Filepath must contain ".ifc" (case-insensitive)')
  }
  const parts = filepath.split(splitRegex)
  filepath = `/${parts[0]}${match[0]}`
  if (pathPrefix.endsWith('new') || pathPrefix.endsWith('/p')) {
    // * param is defined in ../Share.jsx, e.g.:
    //   /v/p/*.  It should be only the filename.
    // Filepath is a reference rooted in the serving directory.
    // e.g. /haus.ifc or /ifc-files/haus.ifc
    m = {
      filepath: filepath,
      eltPath: parts[1],
    }
    debug().log('Share#getModelPath: is a project file: ', m, window.location.hash)
  } else if (pathPrefix.endsWith('/gh')) {
    m = {
      org: urlParams['org'],
      repo: urlParams['repo'],
      branch: urlParams['branch'],
      filepath: filepath,
      eltPath: parts[1],
    }
    m.getRepoPath = () => `/${m.org}/${m.repo}/${m.branch}${m.filepath}`
    m.gitpath = `https://github.com${m.getRepoPath()}`
    debug().log('Share#getModelPath: is a remote GitHub file: ', m)
  } else {
    throw new Error('Empty view type from pathPrefix')
  }
  return m
}
