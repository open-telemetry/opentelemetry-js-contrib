import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function Contact() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: '',
  });

  const handleSubmit = e => {
    e.preventDefault();
    console.log('Form submitted:', formData);
    // Simulate form submission and navigation
    alert('Thank you for your message!');
    navigate('/');
  };

  const handleInputChange = e => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <div className="page">
      <h2>Contact Us</h2>
      <p>Get in touch with our team about OpenTelemetry instrumentation.</p>

      <form onSubmit={handleSubmit} className="contact-form">
        <div className="form-group">
          <label htmlFor="name">Name:</label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="email">Email:</label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleInputChange}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="message">Message:</label>
          <textarea
            id="message"
            name="message"
            value={formData.message}
            onChange={handleInputChange}
            rows="4"
            required
          ></textarea>
        </div>

        <button type="submit" className="submit-btn">
          Send Message
        </button>
      </form>

      <div className="contact-info">
        <h3>Other Ways to Reach Us</h3>
        <p>Email: support@opentelemetry.io</p>
        <p>
          GitHub:{' '}
          <a
            href="https://github.com/open-telemetry/opentelemetry-js-contrib"
            target="_blank"
            rel="noopener noreferrer"
          >
            opentelemetry-js-contrib
          </a>
        </p>
      </div>
    </div>
  );
}

export default Contact;
