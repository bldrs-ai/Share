import React from 'react';
import { grey } from '@mui/material/colors';
import CadView from './Containers/CadView';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import 'normalize.css'


const theme = createTheme({
  status: {
    danger: 'foo',
  },
});

const App = () => (
  <ThemeProvider theme={theme}>
    <CadView />
  </ThemeProvider>
)

export default App;
