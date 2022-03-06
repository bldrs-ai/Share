/**
 * @param {function} createTheme Mui createTheme
 * @param {string} mode
 * @return {Object} Theme settings
 */
export function loadTheme(createTheme, mode) {
  const palette = {
    main: '#C8C8C8',
    light: 'white', // was '#e3f2fd',
    dark: '#252525', // was '#42a5f5',
  }
  const getColor = (mode, colors = ['light', 'dark']) => {
    return mode === 'light' ? palette[colors[0]] : palette[colors[1]]
  }
  return createTheme({
    palette: {
      mode,
      background: {
        paper: getColor(mode, ['light', 'dark']),
      },
      fill: mode === 'light' ? 'black' : 'white',
      logo: {
        leftFace: mode === 'light' ? 'white' : 'black',
        rightFace: mode === 'light' ? 'darkgrey' : 'darkgrey',
        edges: mode === 'light' ? 'black' : 'white',
      },
      tonalOffset: 1,
    },
    shape: {
      borderRadius: 10,
    },
  })
}
