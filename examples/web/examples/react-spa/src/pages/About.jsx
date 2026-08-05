import React from 'react';

function About() {
  const handleHashNavigation = () => {
    window.location.hash = '#team';
  };

  return (
    <div className="page">
      <h2>About Us</h2>
      <p>
        Learn more about our OpenTelemetry browser navigation instrumentation.
      </p>

      <div className="test-buttons">
        <button onClick={handleHashNavigation} className="test-btn">
          Jump to Team Section
        </button>
      </div>

      <div className="content-section">
        <h3>About This Demo</h3>
        <p>This React application demonstrates:</p>
        <ul>
          <li>Single Page Application (SPA) routing</li>
          <li>Navigation event tracking</li>
          <li>Hash change detection</li>
          <li>Browser history management</li>
        </ul>
      </div>

      <div id="team" className="hash-section">
        <h4>Our Team</h4>
        <p>We're building better observability tools for web applications.</p>
      </div>
    </div>
  );
}

export default About;
