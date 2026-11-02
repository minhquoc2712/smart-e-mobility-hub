import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { IS_MOCK_MODE } from '../../api';

export function StudentLayout() {
  const { user, isOperator, logout } = useAuth();
  const navigate = useNavigate();

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
        <div className="brand-title">⚡ Smart E-Mobility Hub · VNU-HCM</div>
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
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.88rem' }}>
          <span>{user?.fullName} (<strong>{user?.role}</strong>)</span>
          <button type="button" className="btn btn-outline" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="container">
        <Outlet />
      </main>
    </div>
  );
}
