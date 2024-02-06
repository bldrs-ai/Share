import {getColors} from './Colors'


const colors = getColors()


export const day = {
  mode: 'light',

  // The 3d canvas and ControlButtons on it.
  primary: {
    main: colors.grey.light,
    light: colors.grey.lightest,
    dark: colors.grey.medium,
    contrastText: colors.grey.darkest,
    highlight: 'red',
  },

  // Side drawer, dialogs
  secondary: {
    main: colors.grey.medium,
    light: colors.grey.light,
    dark: colors.grey.dark,
    contrastText: colors.grey.darkest,
    background: 'white', // , 'white', // colors.grey.light,
    highlight: '#ffc700', // orange: tron row5 col2
  },

  background: {
    paper: colors.grey.light,
  },

  scene: {
    background: colors.grey.lightest,
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
    main: colors.grey.dark,
    light: colors.grey.medium,
    dark: colors.grey.darkest,
    contrastText: colors.grey.lightest,
  },

  // Side drawer, dialogs
  secondary: {
    main: colors.grey.dark,
    light: colors.grey.medium,
    dark: colors.grey.darkest,
    contrastText: colors.grey.lightest,
    background: 'white', // , 'white', // colors.grey.light,
  },

  background: {
    paper: colors.grey.darkest,
  },

  scene: {
    background: colors.black,
  },

  logo: {
    frontFace: 'white',
    leftFace: 'lime', // lime: tron row4 col2
  },
}
