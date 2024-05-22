import {getColors} from './Colors'


const colors = getColors()


export const day = {
  mode: 'light',

  // The 3d canvas and ControlButtons on it.
  primary: {
    // TODO(pablo): main controls both primary action buttons and link text in NoteContent.
    main: colors.grey.medium,
    light: colors.grey.lightest,
    dark: colors.grey.mediumlight,
    contrastText: colors.grey.darkest,
    sceneBackground: '#FFFFFF',
    sceneHighlight: '#00F0FF',
  },

  // Side drawer, dialogs
  secondary: {
    main: colors.grey.light,
    light: colors.grey.lightest,
    dark: colors.grey.mediumlight,
    contrastText: colors.grey.darkest,
    // e.g. for list of items with one active
    active: '#00F0FF',
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
    selectedOpacity: 0.3,
  },

  logo: {
    frontFace: 'white',
    leftFace: 'lime', // lime: tron row4 col2
  },
}


export const night = {
  mode: 'dark',

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
    contrastText: colors.grey.lightest,
    // e.g. for list of items with one active
    active: '#00F0FF',
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
    selectedOpacity: 0.3,
  },

  logo: {
    frontFace: 'white',
    leftFace: 'lime', // lime: tron row4 col2
  },
}
