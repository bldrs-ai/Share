import {getColors} from './Colors'


const colors = getColors()


export const day = {
  mode: 'light',

  background: {
    // Same as primary.sceneBackground for no page flicker
    default: '#ffffff',
  },

  // The 3d canvas and ControlButtons on it.
  primary: {
    main: colors.grey.medium,
    light: colors.grey.lightest,
    dark: colors.grey.mediumlight,
    contrastText: colors.grey.darkest,
    sceneBackground: '#ffffff',
    sceneHighlight: '#00F0FF',
    link: colors.blue.dark,
  },

  // Primary action buttons (Connect, Browse, Open)
  accent: {
    main: colors.blue.darkest,
    light: colors.blue.dark,
    dark: '#2222cc',
    contrastText: '#ffffff',
  },

  // Side drawer, dialogs
  secondary: {
    main: colors.grey.light,
    light: colors.grey.lightest,
    dark: colors.grey.mediumlight,
    // partly transparent. 0xC0: 0.75
    contrastText: `${colors.grey.darkest}C0`,
    // To match primary.sceneHighlight
    selected: '#00F0FF40',
    // partly transparent
    backgroundColor: `${colors.grey.light}A0`,
    backdropFilter: 'blur(1px)',
    link: colors.blue.darkest,
    // Workspace shell chrome (ProjectsDrawer). Opaque on purpose — it
    // frames the app rather than floating over the scene like the
    // NavTree/Notes drawers. Tinted toward the tron cyan of
    // primary.sceneHighlight; it has to read as clearly distinct from the
    // white scene background right next to it, so this is a real tint and
    // not a near-white wash.
    workspaceBackground: '#D3E9EE',
    // Collapsed rail: half-opacity, but pre-doubled against the scene
    // background so it still *reads* as the workspace tint. Half of the
    // near-white workspaceBackground over a white scene lands ~4% off
    // white — invisible. Solving 0.5*C + 0.5*white = workspaceBackground
    // gives this, so the rail matches the drawer over the default scene
    // and stays translucent over anything darker.
    workspaceRailBackground: '#A7D3DD',
  },

  success: {
    main: '#0f0',
    light: '#0f0',
    dark: '#0f0',
    contrastText: '#000',
  },

  action: {
    // Found this searching around
    // https://github.com/search?q=repo%3Amui%2Fmaterial-ui%20selectedOpacity&type=code
    selectedOpacity: 0.25,
  },

  logo: {
    frontFace: 'white',
    leftFace: 'lime', // lime: tron row4 col2
  },
}


export const night = {
  mode: 'dark',

  background: {
    // Same as primary.sceneBackground for no page flicker
    default: '#000000',
  },

  // The 3d canvas and ControlButtons on it.
  primary: {
    main: colors.grey.mediumdark,
    light: colors.grey.mediumdark,
    dark: colors.grey.darkest,
    contrastText: colors.grey.lightest,
    sceneBackground: '#000000',
    sceneHighlight: '#00F0FF',
    link: colors.blue.light,
  },

  // Primary action buttons (Connect, Browse, Open)
  accent: {
    main: colors.blue.medium,
    light: colors.blue.light,
    dark: colors.blue.dark,
    contrastText: '#000000',
  },

  // Side drawer, dialogs
  secondary: {
    main: colors.grey.dark,
    light: colors.grey.mediumdark,
    dark: colors.grey.darkest,
    // partly transparent. 0xC0: 0.75
    contrastText: `${colors.grey.lightest}C0`,
    // To match primary.sceneHighlight
    selected: '#00F0FF40',
    // partly transparent. 0x80: 0.5
    backgroundColor: `${colors.grey.dark}80`,
    backdropFilter: 'blur(1px)',
    link: colors.blue.lightest,
    // Workspace shell chrome — see day.secondary.workspaceBackground.
    // Tron teal, light enough to read as a lit panel against the black
    // scene background.
    workspaceBackground: '#0F2E38',
    // See day.secondary.workspaceRailBackground — same derivation
    // against the black night scene.
    workspaceRailBackground: '#1E5C70',
  },

  success: {
    main: '#0f0',
    light: '#0f0',
    dark: '#0f0',
    contrastText: '#000',
  },

  action: {
    // Found this searching around
    // https://github.com/search?q=repo%3Amui%2Fmaterial-ui%20selectedOpacity&type=code
    selectedOpacity: 0.25,
  },

  logo: {
    frontFace: 'white',
    leftFace: 'lime', // lime: tron row4 col2
  },
}
