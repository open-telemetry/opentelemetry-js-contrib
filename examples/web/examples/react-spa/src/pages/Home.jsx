import React from 'react';

function Home() {
  const handleHashChange = () => {
    window.location.hash = '#section1';
  };

  const handleProgrammaticNavigation = () => {
    window.history.pushState({}, '', '/react-spa/about');
    // Trigger a popstate event to simulate navigation
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div className="page">
      <h2>Home Page</h2>
      <p>Welcome to the React SPA navigation test application!</p>

      <div className="test-buttons">
        <button onClick={handleHashChange} className="test-btn">
          Test Hash Change Navigation
        </button>
        <button onClick={handleProgrammaticNavigation} className="test-btn">
          Test Programmatic Navigation
        </button>
      </div>

      <div className="content-section">
        <h3>Navigation Testing</h3>
        <p>This app tests various navigation scenarios:</p>
        <ul>
          <li>React Router Link navigation (SPA routing)</li>
          <li>Hash-based navigation</li>
          <li>Programmatic navigation</li>
          <li>Browser back/forward buttons</li>
        </ul>
      </div>

      <div id="section1" className="hash-section">
        <h4>Hash Section 1</h4>
        <p>This section is reached via hash navigation.</p>
      </div>
    </div>
  );
}

export default Home;
