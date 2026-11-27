import React, {ReactElement} from 'react'
import HomepageVersionsPanel from './HomepageVersionsPanel'
import VersionsPanel from './VersionsPanel'
import {isHomepageModel} from './homepageModel'


/**
 * Select the history for the model's source.
 *
 * @param {object} props
 * @param {?object} props.modelPath Parsed viewer route
 * @param {string} props.branch GitHub branch or commit
 * @return {?ReactElement}
 */
export default function ModelVersionsPanel({modelPath, branch}) {
  if (isHomepageModel(modelPath)) {
    return <HomepageVersionsPanel filePath={modelPath.filepath}/>
  }
  if (modelPath?.repo !== undefined) {
    return <VersionsPanel filePath={modelPath.filepath} currentRef={branch}/>
  }
  return null
}
