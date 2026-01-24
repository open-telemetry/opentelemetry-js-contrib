/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

import { BaseOpenTelemetryComponent } from '@opentelemetry/plugin-react-load';

class Content extends BaseOpenTelemetryComponent {
  constructor(props) {
    super(props);
    this.state = {
      results: null,
      isLoading: false,
    };
  }

  componentDidMount() {
    // Example, do something here
  }

  buttonHandler() {
    this.setState({ isLoading: true });
    const randomDelay = Math.random() * 10000;
    setTimeout(() => {
      this.setState({
        isLoading: false,
        results: randomDelay,
      });
    }, randomDelay);
  }

  renderResults() {
    if (this.state.isLoading) {
      return <div> Loading results...</div>;
    }
    if (!this.state.results) {
      return <div>No Results</div>;
    }
    return <div>Request was delayed {this.state.results} ms</div>;
  }

  render() {
    return (
      <div>
        <h1>React Plugin Demo App</h1>
        <button
          onClick={() => this.buttonHandler()}
          style={{ marginBottom: '20px' }}
        >
          Make Request
        </button>
        <div id="results">{this.renderResults()}</div>
      </div>
    );
  }
}

export default Content;
