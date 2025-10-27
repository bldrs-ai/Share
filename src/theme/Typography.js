// const fontFamily = `"Roboto", "Helvetica", "Arial", sans-serif`
const fontFamily = `"Roboto", sans-serif`
const fontSize = 16
const fontWeight = 400
const letterSpacing = 'normal'
const lineHeight = 1.5


/**
 * @return {object} Typography settings.
 */
export function getTypography() {
  return {
    fontFamily: fontFamily,
    fontSize: fontSize,
    letterSpacing: letterSpacing,
    fontWeight: fontWeight,
    lineHeight: lineHeight,
    h1: {fontSize: 22, lineHeight: '33px', fontWeight},
    h2: {fontSize: 21, lineHeight: '32px', fontWeight},
    h3: {fontSize: 20, lineHeight: '30px', fontWeight},
    h4: {fontSize: 19, lineHeight: '29px', fontWeight},
    h5: {fontSize: 18, lineHeight: '27px', fontWeight: 400},
    h6: {fontSize: 17, lineHeight: '26px', fontWeight: 500},
    body1: {fontSize, lineHeight: '24px', letterSpacing, fontWeight},
    body2: {fontSize, lineHeight: '24px', letterSpacing, fontWeight},
    tree: {fontSize, lineHeight: '24px', letterSpacing, fontWeight},
    propTitle: {fontSize, lineHeight: '24px', letterSpacing, fontWeight: 300},
    propValue: {fontSize, lineHeight: '24px', letterSpacing, fontWeight},
  }
}
