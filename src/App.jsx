import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { grey } from '@mui/material/colors';
import CadView from './Containers/CadView';
import '../public/favicon.ico';

import { ThemeProvider, createTheme } from '@mui/material/styles';
const theme = createTheme({
  status: {
    danger: 'foo',
  },
});

const App = () => (
  <ThemeProvider theme={theme}>
    <Routes>
      <Route path='/*' element={<CadView />}/>
    </Routes>
  </ThemeProvider>
)

export default App;
