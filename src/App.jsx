import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { grey } from '@mui/material/colors';
import CadView from './Containers/CadView';
import '../public/favicon.ico';

import { ThemeProvider, createTheme } from '@mui/material/styles';
const theme = createTheme({
  status: {
    danger: 'foo',
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CadView />
      <Router>
        <Routes>
          <Route path='/' element={<CadView />} />
          <Route path='/about' element={<div>hello</div>} />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;
