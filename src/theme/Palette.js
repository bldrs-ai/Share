import {getColors} from './Colors'


const colors = getColors()


export const day = {
  mode: 'light',
  primary: {
    main: '#6D8752',
    background: colors.grey.lightest,
    contrastText: colors.black,
    highlight: colors.orange,
  },
  secondary: {
    main: colors.grey.dark,
    background: colors.grey.light,
    contrastText: colors.green.dark,
  },
  background: {
    paper: colors.grey.lightest,
  },
  scene: {
    background: colors.grey.lightest,
  },
}


export const night = {
  mode: 'dark',
  primary: {
    main: '#6D8752',
    background: colors.grey.dark,
    contrastText: colors.grey.lightest,
    highlight: colors.orange,
  },
  secondary: {
    main: colors.grey.light,
    background: colors.black,
    contrastText: colors.green.light,
  },
  background: {
    paper: colors.grey.dark,
  },
  scene: {
    background: colors.black,
  },
}
