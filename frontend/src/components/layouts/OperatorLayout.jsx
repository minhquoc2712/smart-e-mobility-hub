import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const STAFF_NAV_ITEMS = [
  { to: '/operator/dashboard', label: 'Overview' },
  { to: '/operator/hub-utilization', label: 'Hub utilization' },
  { to: '/operator/manage-parking', label: 'Manage parking' },
  { to: '/operator/vehicles-charging', label: 'Vehicle & charging' },
  { to: '/operator/incidents', label: 'Incidents' },
  { to: '/operator/dispatch', label: 'Dispatch' },
  { to: '/operator/simulation', label: 'What-if' },
  { to: '/operator/profile', label: 'Personal information' },
];

export function OperatorLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const savedProfile = (() => {
    try {
      return JSON.parse(localStorage.getItem('semh_staff_profile') || 'null');
    } catch {
      return null;
    }
  })();

  const displayName =
    savedProfile?.name ||
    (user?.fullName && user.fullName !== 'Lê Điều Phối Viên' ? user.fullName : 'A. Lee');
  const staffCode = savedProfile?.staffCode || user?.staffCode || 'ST-014';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="staff-shell">
      <header className="staff-header">
        <NavLink to="/operator/dashboard" className="staff-brand">
          Smart E-MOBILITY HUB
        </NavLink>

        <div className="staff-account-bar">
          <button
            type="button"
            onClick={handleLogout}
            title="Click to sign out / switch role"
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
            }}
            className="staff-account-name"
          >
            {displayName} · {staffCode}
          </button>
        </div>
      </header>

      <nav className="staff-nav" aria-label="Staff navigation">
        {STAFF_NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `staff-nav-item ${isActive ? 'active' : ''}`}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <main className="staff-workspace">
        <Outlet />
      </main>
    </div>
  );
}
