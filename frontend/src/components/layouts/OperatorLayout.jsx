import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { IS_MOCK_MODE } from '../../api';
import logo from '../common/images/logo.jpg';

export function OperatorLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app-shell">
      {IS_MOCK_MODE && (
        <div className="mock-banner">
          Operator Console · OpenAPI Mock Mode (Task 3.0)
        </div>
      )}
      <header className="topbar">
        <div className="brand-title">
          <img src={logo} alt="" />
          <span>Smart E-MOBILITY HUB</span>
        </div>
        <nav className="nav-links">
          <NavLink to="/operator/dashboard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Network Monitor
          </NavLink>
          <NavLink to="/operator/incidents" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Incidents
          </NavLink>
          <NavLink to="/operator/dispatch" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Charging Queue & Dispatch
          </NavLink>
          <NavLink to="/operator/simulation" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            What-if Simulation
          </NavLink>
          <NavLink to="/student/hubs" className="nav-link">
            Student View →
          </NavLink>
        </nav>
        <div className="profile-menu">
          <div className="profile-details">
            <span>{user?.fullName}</span>
            <strong>{user?.role}</strong>
          </div>
          <button
            type="button"
            className="profile-button"
            aria-label="Open profile menu"
            aria-expanded={profileMenuOpen}
            onClick={() => setProfileMenuOpen((open) => !open)}
          />
          {profileMenuOpen && (
            <button type="button" className="profile-signout" onClick={handleLogout}>
              Sign out
            </button>
          )}
        </div>
      </header>

      <main className="container">
        <Outlet />
      </main>
    </div>
  );
}
