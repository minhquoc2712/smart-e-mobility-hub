import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { IS_MOCK_MODE } from '../../api';

export function OperatorLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

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
        <div className="brand-title">🛠️ Operator Control · Smart E-Mobility Hub</div>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.88rem' }}>
          <span>{user?.email}</span>
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
