import {getColors} from './Colors'


const colors = getColors()


export const day = {
  mode: 'light',

  // The 3d canvas and ControlButtons on it.
  primary: {
    main: colors.grey.lightest,
    light: colors.grey.white,
    dark: colors.grey.medium,
    contrastText: colors.grey.darkest,
    highlight: 'red',
  },

  // Side drawer, dialogs
  secondary: {
    main: '#00CCFF', //  flour blue:       tron-row4-col1
    light: '#00EEFF', // flour blue light: tron-row4-col2
    dark: '#00CCEE', //  flour blue dark:  tron-row4-col3
    contrastText: colors.grey.darkest,
    background: 'white', // , 'white', // colors.grey.light,
    highlight: 'orange', // '#ffc700', // orange: tron row5 col2
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
    highlight: 'red',
  },

  // Side drawer, dialogs
  secondary: {
    main: '#00CCFF', //  flour blue:       tron-row4-col1
    light: '#00EEFF', // flour blue light: tron-row4-col2
    dark: '#00CCEE', //  flour blue dark:  tron-row4-col3
    contrastText: colors.grey.darkest,
    background: 'white', // , 'white', // colors.grey.light,
    highlight: 'orange', // '#ffc700', // orange: tron row5 col2
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
