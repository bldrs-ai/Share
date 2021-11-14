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

<<<<<<< HEAD
const App = () => (
  <ThemeProvider theme={theme}>
    <Routes>
      <Route path='/*' element={<CadView />}/>
    </Routes>
  </ThemeProvider>
)
=======
function App() {
  return (
    <ThemeProvider theme={theme}>
      <Router>
        <Routes>
          <Route path='/' element={<div>hello</div>} />
          {/* <Route path='/about' element={<CadView />} /> */}
        </Routes>
      </Router>
    </ThemeProvider>
  );
}
>>>>>>> b9084c59983d33072c955536189d6d9814438e1c

export default App;
