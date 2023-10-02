import {getColors} from './Colors'


const colors = getColors()


export const day = {
  mode: 'light',
  primary: {
    main: '#6D8752',
    background: colors.grey.light,
    contrastText: colors.black,
    highlight: colors.orange,
  },
  secondary: {
    main: colors.grey.dark,
    background: colors.green.lightest,
    contrastText: colors.green.dark,
  },
  background: {
    paper: colors.grey.light,
  },
  scene: {
    background: colors.grey.lightest,
  },
}


export const night = {
  mode: 'dark',
  primary: {
    main: '#6D8752',
    background: colors.grey.darkest,
    contrastText: colors.grey.lightest,
    highlight: colors.orange,
  },
  secondary: {
    main: colors.grey.light,
    background: colors.green.medium,
    contrastText: colors.green.lightest,
  },
  background: {
    paper: colors.grey.darkest,
  },
  scene: {
    background: colors.black,
  },
}
