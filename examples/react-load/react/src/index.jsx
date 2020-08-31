import React from 'react';
import ReactDOM from 'react-dom';
import {BrowserRouter as Router, Route } from 'react-router-dom';
import Home from './Home';
import Content from './Content';
import Tracer from './web-tracer.js';

Tracer('example-react-load')

ReactDOM.render(
	<Router>
	  <main>
		  <Route exact path='/' component={Home}/>
		  <Route exact path='/test' component={Content}/>
	  </main>
	</Router>
,document.getElementById('root'));
