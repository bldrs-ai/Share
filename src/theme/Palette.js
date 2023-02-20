import {getColors} from './Colors'


const colors = getColors()


export const day = {
  mode: 'light',
  primary: {
    main: colors.grey.medium,
    background: colors.grey.light,
    contrastText: colors.black,
    highlight: colors.orange,
  },
  secondary: {
    main: colors.green.darkest,
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
    main: colors.grey.dark,
    background: colors.grey.darkest,
    contrastText: colors.grey.lightest,
    highlight: colors.orange,
  },
  secondary: {
    main: colors.green.lightest,
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
