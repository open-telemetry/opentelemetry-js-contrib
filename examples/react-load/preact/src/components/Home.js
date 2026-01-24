import { Link } from 'preact-router/match';
import { BaseOpenTelemetryComponent } from '@opentelemetry/plugin-react-load';

class Home extends BaseOpenTelemetryComponent {
  render() {
    return (
      <div>
          <h1>
              React Plugin Demo App: Preact
          </h1>
          <Link href='/test'><button>Enter</button></Link>
      </div>
    )
  }
}

export default Home;
