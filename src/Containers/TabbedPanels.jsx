import React, {ReactElement, useState, useEffect} from 'react'
import {Box, Stack, Tab, Tabs} from '@mui/material'
import {Close as CloseIcon} from '@mui/icons-material'
import AppsPanel from '../Components/Apps/AppsPanel'
import AppPanel from '../Components/Apps/AppPanel'
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

  const isVersionsEnabled = useStore((state) => state.isVersionsEnabled)
  const isVersionsVisible = useStore((state) => state.isVersionsVisible)
  const setIsVersionsVisible = useStore((state) => state.setIsVersionsVisible)

  // Next two are used by NavTree and Versions
  // IFCSlice
  const model = useStore((state) => state.model)
  const rootElement = useStore((state) => state.rootElement)

  // RepositorySlice
  const modelPath = useStore((state) => state.modelPath)

  // This state tracks the order in which panels were opened.
  // We'll store keys like 'apps', 'nav', 'notes', 'props', 'versions'.
  const [openPanels, setOpenPanels] = useState([])

  const [value, setValue] = useState(0)

  const handleChange = (event, newValue) => setValue(newValue)

  /**
   * @param {number} index
   * @return {object}
   */
  function a11yProps(index) {
    return {
      'id': `simple-tab-${index}`,
      'data-testid': `simple-tab-${index}`,
      'aria-controls': `simple-tabpanel-${index}`,
    }
  }

  const isDrawerVisible =
        isAppsVisible ||
        isNavTreeVisible ||
        isNotesVisible ||
        isPropertiesVisible ||
        isVersionsVisible


  /**
   * @param {string} label - The tab label
   * @param {Function} onClose - Close handler
   * @return {ReactElement}
   */
  function createTabLabel(label, onClose) {
    return (
      <Stack direction='row' alignItems='center'>
        {label}
        <Box
          component='span'
          onClick={(event) => {
            event.stopPropagation()
            onClose()
          }}
          className='share-button-tab-close'
          sx={{
            'display': 'flex',
            'alignItems': 'center',
            'justifyContent': 'center',
            'cursor': 'pointer',
            'padding': '4px',
            'borderRadius': '50%',
            '&:hover': {
              backgroundColor: 'rgba(0, 0, 0, 0.04)',
            },
          }}
        >
          <CloseIcon sx={{fontSize: '16px'}}/>
        </Box>
      </Stack>
    )
  }

  // Compute the currently visible panels in the order they appear in openPanels.
  // The order in openPanels will determine the order in labelAndPanels.
  const panelsMap = {
    apps: isAppsEnabled && isAppsVisible ?
      {
        label: createTabLabel('Apps', () => setIsAppsVisible(false)),
        panel: !selectedApp ? <AppsPanel/> : <AppPanel itemJson={selectedApp}/>,
      } :
      null,
    nav: isNavTreeEnabled && isNavTreeVisible ?
      {
        label: createTabLabel('Nav', () => setIsNavTreeVisible(false)),
        panel: model && rootElement && (
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
          />
        ),
      } :
      null,
    notes: isNotesEnabled && isNotesVisible ?
      {
        label: createTabLabel('Notes', () => setIsNotesVisible(false)),
        panel: <NotesPanel/>,
      } :
      null,
    props: isPropertiesEnabled && isPropertiesVisible ?
      {
        label: createTabLabel('Props', () => setIsPropertiesVisible(false)),
        panel: <PropertiesPanel/>,
      } :
      null,
    versions: isVersionsEnabled && isVersionsVisible ?
      {
        label: createTabLabel('Versions', () => setIsVersionsVisible(false)),
        panel: modelPath.repo !== undefined && <VersionsPanel filePath={modelPath.filepath} currentRef={branch}/>,
      } :
      null,
  }

  // Update openPanels whenever visibility changes.
  // If a panel is newly visible and not in openPanels, add it.
  // If a panel is no longer visible and is in openPanels, remove it.
  useEffect(() => {
    const panelKeys = ['apps', 'nav', 'notes', 'props', 'versions']
    setOpenPanels((prev) => {
      let newOpenPanels = [...prev]

      // Add newly visible panels that are not in the list
      panelKeys.forEach((key) => {
        const isVisible = panelsMap[key] !== null
        const existsInOpenPanels = newOpenPanels.includes(key)

        if (isVisible && !existsInOpenPanels) {
          // Add at the end since it's newly opened
          newOpenPanels.push(key)
        } else if (!isVisible && existsInOpenPanels) {
          // Remove it if it's no longer visible
          newOpenPanels = newOpenPanels.filter((k) => k !== key)
        }
      })

      return newOpenPanels
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAppsVisible, isNavTreeVisible, isNotesVisible, isPropertiesVisible, isVersionsVisible])

  // Generate labelAndPanels according to openPanels order
  const labelAndPanels = openPanels
    .map((key) => panelsMap[key])
    .filter(Boolean) // ensure we only keep actual visible panels

  // After labelAndPanels update, select the most recent panel (last in openPanels).
  useEffect(() => {
    if (labelAndPanels.length > 0) {
      // Select the last added panel (which should be the last in openPanels, hence last in labelAndPanels)
      const newValue = labelAndPanels.length - 1
      setValue(newValue)
    } else {
      // No panels left
      setValue(0)
    }
  }, [labelAndPanels.length])

  // Ensure value is always within bounds of available tabs
  const safeValue = Math.min(value, Math.max(0, labelAndPanels.length - 1))

  return (
    isDrawerVisible && (
      <Box
        sx={{
          position: 'absolute',
          bottom: 0,
          width: '100%',
        }}
        data-testid='TabbedPanels-Box1'
      >
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
                value={safeValue}
                onChange={handleChange}
                variant='scrollable'
                scrollButtons='auto'
                allowScrollButtonsMobile
                aria-label='scrollable basic tabs example'
                sx={{
                  'padding': '0 0.5rem',
                  '& .share-button-tab-close': {
                    display: 'none',
                  },
                  '& .Mui-selected .share-button-tab-close': {
                    display: 'flex',
                  },
                  '& .MuiTab-root [role="tab"]': {
                    padding: '0 0 0 0.5rem',
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
                <CustomTabPanel value={safeValue} index={index} key={index}>
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
