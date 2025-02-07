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
    // TODO(pablo): main controls both primary action buttons and link text in NoteContent.
    main: colors.grey.medium,
    light: colors.grey.lightest,
    dark: colors.grey.mediumlight,
    contrastText: colors.grey.darkest,
    sceneBackground: '#ffffff',
    sceneHighlight: '#00F0FF',
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
