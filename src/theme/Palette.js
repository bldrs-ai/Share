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
    // A step softer than the blue ramp's darkest (#4444ff), which read as
    // too strong on the primary buttons. White on it holds 5.1:1.
    main: '#5555ff',
    light: colors.blue.dark,
    // Hover / press: the same offset below main as before (−0x22 red and
    // green, −0x33 blue; #4444ff → #2222cc).
    dark: '#3333cc',
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
    // Workspace shell chrome (ProjectsDrawer), per the Bldrs Share design
    // system's workspace-* tokens. Opaque on purpose: it frames the app
    // rather than floating over the scene like the NavTree/Notes drawers.
    // The scrolling list sits on grey paper a shade off the white scene;
    // the persistent header band (drawer header + TopBar) and logo footer
    // sit on workspacePaper, set off from the content by workspaceEdge
    // hairlines, so what stays put reads apart from the rows that come
    // and go. Day keeps both neutral — plain light grey and the standard
    // hairline (a chartreuse Day band was tried and read as too much
    // colour); Night carries the tint. The collapsed rail shares the
    // list's ground.
    workspaceBackground: colors.grey.light,
    workspacePaper: colors.grey.light,
    workspaceEdge: 'rgba(16, 16, 16, 0.12)',
    // The drawer's outer right edge: the DS's neutral `border` hairline.
    workspaceBorder: 'rgba(16, 16, 16, 0.12)',
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
    // Near-black list, a step up from the black scene; deep jungle-green
    // paper bands.
    workspaceBackground: '#121212',
    workspacePaper: '#162D25',
    workspaceEdge: 'rgba(90, 230, 170, 0.3)',
    workspaceBorder: 'rgba(250, 250, 250, 0.14)',
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
