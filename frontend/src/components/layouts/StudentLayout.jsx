import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { IS_MOCK_MODE } from '../../api';
import logo from '../common/images/logo.png';

export function StudentLayout() {
  const { user, isOperator, logout } = useAuth();
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
          Running on OpenAPI Mock Client (Task 3.0) — Set <code>VITE_USE_MOCK_API=false</code> in <code>.env</code> when Backend is ready.
        </div>
      )}
      <header className="topbar">
        <div className="brand-title">
          <img src={logo} alt="" />
          <span>Smart E-MOBILITY HUB</span>
        </div>
        <nav className="nav-links">
          <NavLink to="/student/hubs" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Find Hub & Vehicles
          </NavLink>
          <NavLink to="/student/reservations" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Reservations & Pickup/Return
          </NavLink>
          <NavLink to="/student/charging" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Charging & Private EV
          </NavLink>
          {isOperator && (
            <NavLink to="/operator/dashboard" className="nav-link">
              Switch to Operator →
            </NavLink>
          )}
          <NavLink to="/student/vehicles" className="nav-link">My vehicles</NavLink>
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
            <div className="profile-dropdown">
              <button type="button" onClick={() => navigate('/student/vehicles')}>My vehicles</button>
              <button type="button" onClick={handleLogout}>Sign out</button>
            </div>
          )}
        </div>
      </header>

      <main className="container">
        <Outlet />
      </main>
    </div>
  );
}
