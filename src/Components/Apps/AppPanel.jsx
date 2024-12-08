import React, {ReactElement} from 'react'
import useStore from '../../store/useStore'
import {BackButton} from '../Buttons'
import Panel from '../SideDrawer/Panel'
import AppIFrame from './AppIFrame'
import {removeHashParams} from './hashState'


/**
 * @property {object} itemJson App description json
 * @return {ReactElement}
 */
export default function AppPanel({itemJson}) {
  const setIsAppsVisible = useStore((state) => state.setIsAppsVisible)
  const setSelectedApp = useStore((state) => state.setSelectedApp)


  /** Hide panel and remove hash state */
  function onClose() {
    setIsAppsVisible(false)
    removeHashParams()
  }


  return (
    <Panel
      title={itemJson.appName}
      actions={
        <BackButton onClick={() => setSelectedApp(null)}/>
      }
      onClose={onClose}
      iconSrc={itemJson.icon}
      data-testid='AppPanel'
    >
      <AppIFrame itemJson={itemJson}/>
    </Panel>
  )
}
