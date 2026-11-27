import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ThemeToggleButton } from '../../context/ThemeContext';
import { UserAvatarMenu } from '../common/UserAvatarMenu';
import { AccountCreatedBanner } from '../common/AccountCreatedBanner';
import { VnuLogo } from '../common/VnuLogo';
import logo from '../common/images/logo.png';

const STAFF_NAV_ITEMS = [
  { to: '/operator/dashboard', label: 'Overview' },
  { to: '/operator/hub-utilization', label: 'Hub utilization' },
  { to: '/operator/manage-parking', label: 'Manage parking' },
  { to: '/operator/vehicles-charging', label: 'Vehicle & charging' },
  { to: '/operator/incidents', label: 'Incidents' },
  { to: '/operator/dispatch', label: 'Dispatch' },
  { to: '/operator/simulation', label: 'What-if' },
  { to: '/operator/profile', label: 'Personal info' },
];

export function OperatorLayout() {
  const { user } = useAuth();

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

  return (
    <div className="staff-shell">
      <header className="staff-header">
        <NavLink to="/operator/dashboard" className="brand-dual">
          <VnuLogo height={32} />
          <span className="brand-dual__divider" aria-hidden="true" />
          <div className="brand-dual__project">
            <img src={logo} alt="Smart E-Mobility Hub" />
            <div>
              <strong>Smart E-Mobility Hub</strong>
              <span>Operator Control Center</span>
            </div>
          </div>
        </NavLink>

        <div className="staff-account-bar">
          <ThemeToggleButton compact />
          <UserAvatarMenu
            variant="operator"
            displayNameOverride={displayName}
            subtitleOverride={`STAFF · ${staffCode}`}
          />
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
        <AccountCreatedBanner />
        <Outlet />
      </main>
    </div>
  );
}
