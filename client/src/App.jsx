import React, { useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import Submit from './pages/Submit.jsx';
import UserDashboard from './pages/UserDashboard.jsx';
import HandlerDashboard from './pages/HandlerDashboard.jsx';
import RoutingDashboard from './pages/RoutingDashboard.jsx';
import Analytics from './pages/Analytics.jsx';

const links = [
  ['/submit', 'Submit'],
  ['/dashboard', 'My Reports'],
  ['/handler', 'Handler'],
  ['/routing', 'Routing'],
  ['/analytics', 'Analytics'],
];

export default function App() {
  const [theme, setTheme] = useState(() => (
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  ));

  return (
    <div className="app" data-theme={theme}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">₹</span>
          <div>
            <strong>Loan Application Pre-Validator</strong>
            <small>DFA validation · routing · tracking</small>
          </div>
        </div>
        <nav aria-label="Main">
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : '')}>{label}</NavLink>
          ))}
        </nav>
        <button
          type="button"
          className="btn theme-toggle"
          onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
      </header>
      <main className="page">
        <Routes>
          <Route path="/" element={<Navigate to="/submit" replace />} />
          <Route path="/submit" element={<Submit />} />
          <Route path="/dashboard" element={<UserDashboard />} />
          <Route path="/handler" element={<HandlerDashboard />} />
          <Route path="/routing" element={<RoutingDashboard />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="*" element={<Navigate to="/submit" replace />} />
        </Routes>
      </main>
    </div>
  );
}
