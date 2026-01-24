import { h, Component} from 'preact';
import { Router } from 'preact-router';
import Home from './Home';
import Content from './Content';
import Tracer from '../web-tracer';

Tracer('react-load-preact-examples');

export default class App extends Component {
	
	/** Gets fired when the route changes.
	 * @param {Object} event	"change" event from [preact-router](http://git.io/preact-router)
	 * @param {string} event.url The newly routed URL
	 */
	handleRoute = e => {
		this.currentUrl = e.url;
	};

	render() {
		return (
			<div id="app">
				<Router onChange={this.handleRoute}>
					<Home path="/" />
					<Content path="/test"/>
				</Router>
			</div>
		);
	}
}
