import React, {ReactElement, useState} from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import AppsPanel from '../Components/Apps/AppsPanel'
import AppPanel from '../Components/Apps/AppPanel'
import {CloseButton} from '../Components/Buttons'
import NavTreePanel from '../Components/NavTree/NavTreePanel'
import NotesPanel from '../Components/Notes/NotesPanel'
import PropertiesPanel from '../Components/Properties/PropertiesPanel'
import SideDrawer from '../Components/SideDrawer/SideDrawer'
import VersionsPanel from '../Components/Versions/VersionsPanel'
import useStore from '../store/useStore'


/**
 * @return {ReactElement}
 */
export default function TabbedPanels({
  pathPrefix,
  branch,
  selectWithShiftClickEvents,
}) {
  const selectedApp = useStore((state) => state.selectedApp)

  const isAppsEnabled = useStore((state) => state.isAppsEnabled)
  const isAppsVisible = useStore((state) => state.isAppsVisible)
  const setIsAppsVisible = useStore((state) => state.setIsAppsVisible)

  const isNavTreeEnabled = useStore((state) => state.isNavTreeEnabled)
  const isNavTreeVisible = useStore((state) => state.isNavTreeVisible)
  const setIsNavTreeVisible = useStore((state) => state.setIsNavTreeVisible)

  const isNotesEnabled = useStore((state) => state.isNotesEnabled)
  const isNotesVisible = useStore((state) => state.isNotesVisible)
  const setIsNotesVisible = useStore((state) => state.setIsNotesVisible)

  const isPropertiesEnabled = useStore((state) => state.isPropertiesEnabled)
  const isPropertiesVisible = useStore((state) => state.isPropertiesVisible)
  const setIsPropertiesVisible = useStore((state) => state.setIsPropertiesVisible)

  const isVersionsEnabled = useStore((state) => state.isVerisonsEnabled)
  const isVersionsVisible = useStore((state) => state.isVersionsVisible)
  const setIsVersionsVisible = useStore((state) => state.setIsVersionsVisible)

  // Next two are used by NavTree and Versions
  // IFCSlice
  const model = useStore((state) => state.model)
  const rootElement = useStore((state) => state.rootElement)

  // RepositorySlice
  const modelPath = useStore((state) => state.modelPath)

  const [value, setValue] = useState(0)


  const handleChange = (event, newValue) => setValue(newValue)


  /**
   * @param {number} index
   * @return {object}
   */
  function a11yProps(index) {
    return {
      'id': `simple-tab-${index}`,
      'aria-controls': `simple-tabpanel-${index}`,
    }
  }


  const isDrawerVisible =
        isAppsVisible ||
        isNavTreeVisible ||
        isNotesVisible ||
        isPropertiesVisible ||
        isVersionsVisible


  /** @return {boolean} */
  function samePageLinkNavigation(event) {
    if (
      event.defaultPrevented ||
        event.button !== 0 || // ignore everything but left-click
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey
    ) {
      return false
    }
    return true
  }


  /** @return {ReactElement} */
  function LinkTab({label, onClose, ...props}) {
    return (
      <Tab
        label={
          <Stack direction='row' alignItems='center'>
            {label}
            <CloseButton onCloseClick={onClose} className='share-button-tab-close'/>
          </Stack>
        }
        onClick={(event) => {
          // Routing libraries handle this, you can remove the onClick handle when using them.
          if (samePageLinkNavigation(event)) {
            event.preventDefault()
          }
        }}
        aria-current={props.selected && 'page'}
      />
    )
  }


  const labelAndPanels = []
  if (isAppsEnabled && isAppsVisible) {
    labelAndPanels.push({
      label: <LinkTab label='Apps' onClose={() => setIsAppsVisible(false)}/>,
      panel: !selectedApp ?
        <AppsPanel/> :
        <AppPanel itemJson={selectedApp}/>,
    })
  }
  if (isNavTreeEnabled && isNavTreeVisible) {
    labelAndPanels.push({
      label: <LinkTab label='Nav' onClose={() => setIsNavTreeVisible(false)}/>,
      panel: model &&
        rootElement &&
        <NavTreePanel
          model={model}
          pathPrefix={
            pathPrefix + (
              modelPath.gitpath ?
                modelPath.getRepoPath() :
                modelPath.filepath
            )
          }
          selectWithShiftClickEvents={selectWithShiftClickEvents}
        />,
    })
  }
  if (isNotesEnabled && isNotesVisible) {
    labelAndPanels.push({
      label: <LinkTab label='Notes' onClose={() => setIsNotesVisible(false)}/>,
      panel: <NotesPanel/>,
    })
  }
  if (isPropertiesEnabled && isPropertiesVisible) {
    labelAndPanels.push({
      label: <LinkTab label='Props' onClose={() => setIsPropertiesVisible(false)}/>,
      panel: <PropertiesPanel/>,
    })
  }
  if (isVersionsEnabled) {
    labelAndPanels.push({
      label: <LinkTab label='Versions' onClose={() => setIsVersionsVisible(false)}/>,
      panel: (modelPath.repo !== undefined) &&
        isVersionsVisible &&
        <VersionsPanel filePath={modelPath.filepath} currentRef={branch}/>,
    })
  }

/*
  useEffect(() => {
    if (isAppsVisible) {
      if (!stack.includes('apps')) {
      }
    } else if (isNotesVisible) {
      setValue(1)
    } else if (isPropertiesVisible) {
      setValue(2)
    } else if (isVersionsVisible) {
      setValue(3)
    }
  }, [isAppsVisible, isNotesVisible, isPropertiesVisible, isVersionsVisible])
*/

  return (
    isDrawerVisible && (
      <Box sx={{position: 'absolute', bottom: 0, width: '100%'}} data-testid='TabbedPanels-Box1'>
        <SideDrawer
          isDrawerVisible={isDrawerVisible}
          drawerWidth={0}
          drawerWidthInitial={0}
          setDrawerWidth={() => console.warn('setDrawerWidth called on mobile drawer')}
          dataTestId='TabbedPanels'
        >
          <Box
            sx={{
              height: '100%',
              borderBottom: 1,
              borderColor: 'divider',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <Box sx={{position: 'sticky', top: 0, zIndex: 1}}>
              <Tabs
                value={value}
                onChange={handleChange}
                variant='scrollable'
                scrollButtons='auto'
                allowScrollButtonsMobile
                aria-label='scrollable basic tabs example'
                sx={{
                  '& .share-button-tab-close': {
                    display: 'none',
                  },
                  '& .Mui-selected .share-button-tab-close': {
                    display: 'flex',
                  },
                }}
              >
                {labelAndPanels.map((entry, index) => (
                  <Tab
                    label={entry.label}
                    {...a11yProps(index)}
                    key={index}
                    sx={{padding: 0}}
                  />
                ))}
              </Tabs>
            </Box>
            <Box sx={{flex: 1, overflow: 'auto'}}>
              {labelAndPanels.map((entry, index) => (
                <CustomTabPanel value={value} index={index} key={index}>
                  {entry.panel}
                </CustomTabPanel>
              ))}
            </Box>
          </Box>
        </SideDrawer>
      </Box>
    )
  )
}


/**
 * @param {object} props
 * @return {ReactElement}
 */
function CustomTabPanel(props) {
  const {children, value, index, ...other} = props

  return (
    <Box
      role='tabpanel'
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      sx={{
        height: '100%',
      }}
      {...other}
    >
      {value === index && <Box sx={{height: '100%'}}>{children}</Box>}
    </Box>
  )
}

