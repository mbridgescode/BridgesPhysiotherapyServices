import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import bpsLogo from '../logo/BPS Logo.png';

const AuthLayout = ({ title, description, icon, children, links = [] }) => (
  <main className="auth-shell">
    <section className="auth-card" aria-labelledby="auth-title">
      <div className="auth-brand">
        <img src={bpsLogo} alt="Bridges Physiotherapy Services" />
        <div>
          <div className="auth-brand__name">BRIDGES</div>
          <div className="auth-brand__meta">Physiotherapy Services</div>
        </div>
      </div>
      <div className="auth-icon" aria-hidden="true">{icon}</div>
      <h1 className="auth-title" id="auth-title">{title}</h1>
      {description && <p className="auth-description">{description}</p>}
      {children}
      {links.length > 0 && (
        <nav className="auth-links" aria-label="Account links">
          {links.map((link) => (
            <RouterLink className="auth-link" key={link.to} to={link.to}>{link.label}</RouterLink>
          ))}
        </nav>
      )}
    </section>
  </main>
);

export default AuthLayout;
