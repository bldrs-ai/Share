import React from 'react';
import { BrowserRouter, Routes, Route, Link, useNavigate, useRoutes } from 'react-router-dom';
import { render } from 'react-dom'
import App from './App';


const About = () =>
  <div>
    What about it?!

    <p><Link to='/Share/'>Home</Link></p>
  </div>;


function Routed() {
  const nav = useNavigate();

  React.useEffect(() => {
    const referrer = document.referrer;
    if (referrer) {
      console.log('Referrer: ', document.referrer);
      const path = new URL(document.referrer).pathname;
      console.log('Referrer: path: ', path);
      if (path.length > 1) {
        nav(path);
      }
    }
  }, []);

  let element = useRoutes([
    { path: "/Share/*", element: <App /> },
    { path: "/Share/about", element: <About /> }
  ]);
  return element;
}

render(
  <BrowserRouter>
    <Routed/>
  </BrowserRouter>, document.getElementById('root'))
