import React from 'react'
import Paper from '@mui/material/Paper'
import {useAuth0} from '@auth0/auth0-react'
import {TooltipIconButton} from './Buttons'
import SaveModelControl from './SaveModelControl'
import useStore from '../store/useStore'
import SearchIcon from '../assets/icons/Search.svg'
// import OpenModelControl from '../Components/OpenModelControl'
import OpenIcon from '../assets/icons/Open.svg'
import TreeIcon from '../assets/icons/Tree.svg'
// import StructureMenu from '../Components/StructureMenu'
// import TreeMenu from './NavigationMenu'


/**
 * Controls group contains toggles for fileapth, branches, spatial navigation, and element type navigation
 *
 * @param {Function} modelPath object containing information about the location of the model
 * @return {React.Component}
 */
export default function ControlsGroup({modelPath, isLocalModel, fileOpen}) {
  // const isBranches = useStore((state) => state.isBranches)
  // const isBranchControlVisible = useStore((state) => state.isBranchControlVisible)
  // const toggleIsBranchControlVisible = useStore((state) => state.toggleIsBranchControlVisible)
  const isSearchBarVisible = useStore((state) => state.isSearchBarVisible)
  const isNavPanelOpen = useStore((state) => state.isNavPanelOpen)
  const showNavigationGroup = useStore((state) => state.showNavigationGroup)
  const showProjectPanel = useStore((state) => state.showProjectPanel)
  const showViewsPanel = useStore((state) => state.showViewsPanel)
  const toggleShowProjectPanel = useStore((state) => state.toggleShowProjectPanel)
  const toggleShowViewsPanel = useStore((state) => state.toggleShowViewsPanel)
  const toggleIsSearchBarVisible = useStore((state) => state.toggleIsSearchBarVisible)
  const toggleShowNavigationGroup = useStore((state) => state.toggleShowNavigationGroup)
  const hideNavPanel = useStore((state) => state.hideNavPanel)
  const {isAuthenticated} = useAuth0()

  return (
    <Paper
      elevation={1}
      variant='control'
      sx={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'flex-start',
        marginLeft: '5px',
        borderRadius: '10px',
        opacity: .9,
      }}
    >
      <TooltipIconButton
        title={'Projects'}
        showTitle={false}
        onClick={() => {
          toggleShowProjectPanel()
          if (showViewsPanel) {
            toggleShowViewsPanel()
          }
        }}
        selected={showProjectPanel}
        icon={<OpenIcon/>}
        placement={'bottom'}
        dataTestId='spatial-elements'
      />
      {isLocalModel && isAuthenticated &&
          <SaveModelControl modelPath={modelPath}/>
      }
      <TooltipIconButton
        title={'Search by property name'}
        showTitle={false}
        onClick={toggleIsSearchBarVisible}
        selected={isSearchBarVisible}
        icon={<SearchIcon/>}
        placement={'bottom'}
        dataTestId='spatial-elements'
      />
      {isAuthenticated &&
          <TooltipIconButton
            title={'Navigation'}
            showTitle={false}
            onClick={() => {
              if (isNavPanelOpen) {
                hideNavPanel()
              }
              toggleShowNavigationGroup()
            }}
            selected={showNavigationGroup || isNavPanelOpen}
            icon={<TreeIcon/>}
            placement={'bottom'}
            dataTestId='spatial-elements'
          />
      }
      {/* {isBranches &&
        <TooltipIconButton
          title={'Versions'}
          onClick={toggleIsBranchControlVisible}
          selected={isBranchControlVisible}
          icon={<BranchIcon/>}
          placement={'bottom'}
          dataTestId='project-version'
        />
      } */}
      {/* <TreeMenu/> */}
      {/* <StructureMenu/> */}
    </Paper>
  )
}
